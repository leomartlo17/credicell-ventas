import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { asegurarHojaInventario, HOJA_INVENTARIO, hojaInventario } from "@/lib/inventario";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/inicializar-inventario
 * Admin-only. Fuerza la creación de la hoja de inventario 2026 con headers,
 * para que Leonardo pueda abrirla en Google Sheets y verla antes de subir
 * productos. Si la hoja ya existe, no hace nada.
 */
export async function POST() {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!session.esAdmin) {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede asignada" }, { status: 403 });
  }

  try {
    const existentePrevio = await hojaInventario(sede.libroId);
    const nombre = await asegurarHojaInventario(sede.libroId);
    return NextResponse.json({
      ok: true,
      hoja: nombre,
      yaExistia: existentePrevio !== null,
      mensaje: existentePrevio
        ? `La hoja '${nombre}' ya existía — no se modificó nada.`
        : `Hoja '${nombre}' creada con headers. Ábrela en Google Sheets para verla.`,
      linkLibro: `https://docs.google.com/spreadsheets/d/${sede.libroId}/edit`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error" },
      { status: 500 }
    );
  }
}

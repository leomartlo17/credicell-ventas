import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import {
  asegurarHojaInventario,
  HOJA_INVENTARIO,
} from "@/lib/inventario";
import { listarHojas } from "@/lib/google-sheets";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/inicializar-inventario
 * Admin-only. Crea la pestaña "Inventario android 2026" si no existe,
 * con headers. Si ya existe, no la modifica.
 *
 * Logea los pasos para que si algo falla, la respuesta dice EXACTAMENTE
 * dónde explotó.
 */
export async function POST() {
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);

  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado", logs }, { status: 401 });
  }
  if (!session.esAdmin) {
    return NextResponse.json(
      { error: "Solo admins pueden inicializar la hoja", logs },
      { status: 403 }
    );
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json(
      { error: "Tu usuario no tiene sede asignada", logs },
      { status: 403 }
    );
  }

  try {
    log(`Usuario: ${session.user.email}`);
    log(`Sede: ${sede.nombre} (libro ${sede.libroId})`);

    log("Listando pestañas existentes...");
    const hojasAntes = await listarHojas(sede.libroId);
    log(`Pestañas actuales (${hojasAntes.length}): ${hojasAntes.join(" | ")}`);

    const yaExiste = hojasAntes.includes(HOJA_INVENTARIO);
    log(`¿Ya existe '${HOJA_INVENTARIO}'? ${yaExiste ? "SÍ" : "NO"}`);

    log("Llamando a asegurarHojaInventario (crea si falta)...");
    const nombre = await asegurarHojaInventario(sede.libroId);
    log(`Hoja asegurada: '${nombre}'`);

    log("Listando pestañas después...");
    const hojasDespues = await listarHojas(sede.libroId);
    log(`Pestañas después (${hojasDespues.length}): ${hojasDespues.join(" | ")}`);

    const seCreo = !yaExiste && hojasDespues.includes(HOJA_INVENTARIO);

    return NextResponse.json({
      ok: true,
      hoja: nombre,
      yaExistia: yaExiste,
      seCreo,
      hojasAntes,
      hojasDespues,
      mensaje: seCreo
        ? `✓ Pestaña '${nombre}' CREADA. Abre tu Google Sheets y refresca (F5) — debe aparecer al final de las solapitas.`
        : yaExiste
          ? `La pestaña '${nombre}' ya existía. Abre Google Sheets para verla.`
          : `Algo raro: la hoja no se creó pero tampoco existía antes. Revisa logs.`,
      linkLibro: `https://docs.google.com/spreadsheets/d/${sede.libroId}/edit`,
      logs,
    });
  } catch (error: any) {
    log(`ERROR: ${error?.message || error}`);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Error desconocido",
        stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
        logs,
      },
      { status: 500 }
    );
  }
}

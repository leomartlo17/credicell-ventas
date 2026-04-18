import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { buscarPorImei } from "@/lib/inventario";
import { NextResponse } from "next/server";

/**
 * GET /api/producto/buscar-imei?imei=123456789012345
 * IMEI debe ser exactamente 15 dígitos.
 * Devuelve { encontrado, producto?, vendido?, mensaje? }.
 */
export async function GET(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json(
      { error: "Tu usuario no tiene sede asignada" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const imei = (searchParams.get("imei") || "").replace(/\D/g, "");
  if (imei.length !== 15) {
    return NextResponse.json(
      { error: `IMEI inválido: debe ser 15 dígitos, vinieron ${imei.length}` },
      { status: 400 }
    );
  }

  try {
    const producto = await buscarPorImei(sede.libroId, imei);
    if (!producto) {
      return NextResponse.json({ encontrado: false });
    }
    // Verificar si ya fue vendido consultando disponibles
    // (buscarPorImei no filtra por estado a propósito, para que podamos avisar)
    return NextResponse.json({
      encontrado: true,
      producto,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error buscando IMEI" },
      { status: 500 }
    );
  }
}

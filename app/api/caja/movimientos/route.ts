import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { saldoActual, listarMovimientos, catalogoCaja } from "@/lib/caja";
import { NextResponse } from "next/server";

/**
 * GET /api/caja/movimientos
 * Devuelve el saldo actual de efectivo + últimos movimientos + catálogo
 * de conceptos/establecimientos para poblar formularios.
 */
export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede" }, { status: 403 });
  }

  try {
    const [saldo, movimientos, catalogo] = await Promise.all([
      saldoActual(sede.libroId),
      listarMovimientos(sede.libroId, { limite: 30 }),
      catalogoCaja(sede.libroId),
    ]);
    return NextResponse.json({ saldo, movimientos, catalogo });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error" },
      { status: 500 }
    );
  }
}

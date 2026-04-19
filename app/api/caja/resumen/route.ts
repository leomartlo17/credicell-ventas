import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { resumenCaja, Periodo } from "@/lib/caja";
import { NextResponse } from "next/server";

/**
 * GET /api/caja/resumen?periodo=mes
 * periodo: hoy | mes | 30dias | todo (default: mes)
 * Devuelve totales por medio de pago, por financiera, y sumas globales.
 */
export async function GET(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const periodoParam = searchParams.get("periodo") || "mes";
  const periodo: Periodo = ["hoy", "mes", "30dias", "todo"].includes(periodoParam)
    ? (periodoParam as Periodo)
    : "mes";

  try {
    const resumen = await resumenCaja(sede.libroId, periodo);
    return NextResponse.json({ ...resumen, sede: sede.nombre });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error" },
      { status: 500 }
    );
  }
}

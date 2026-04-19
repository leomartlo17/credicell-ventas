import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { listarMovimientos, catalogoCaja, saldoActual } from "@/lib/caja";
import { NextResponse } from "next/server";

/**
 * GET /api/caja/egresos
 * Lista solo movimientos de tipo EGRESO (incluye sus anulaciones cuando
 * aplica, para trazabilidad). Soporta filtros por período, concepto,
 * establecimiento, autorizado por.
 *
 * Query params:
 *   periodo=hoy|mes|30dias|todo (default: mes)
 *   concepto=<substring>
 *   establecimiento=<substring>
 *   autorizado=<substring>
 *   incluirAnulados=0|1 (default 1)
 *   limite=<N> (default 200)
 */
function filtroDesde(periodo: string): Date | null {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  switch (periodo) {
    case "hoy":
      return hoy;
    case "mes":
      return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    case "30dias": {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "todo":
    default:
      return null;
  }
}

export async function GET(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede" }, { status: 403 });
  }

  const url = new URL(req.url);
  const periodo = url.searchParams.get("periodo") || "mes";
  const concepto = url.searchParams.get("concepto") || undefined;
  const establecimiento =
    url.searchParams.get("establecimiento") || undefined;
  const autorizadoPor = url.searchParams.get("autorizado") || undefined;
  const incluirAnulados = url.searchParams.get("incluirAnulados") !== "0";
  const limite = parseInt(url.searchParams.get("limite") || "200", 10);

  try {
    const desde = filtroDesde(periodo);
    const [egresos, catalogo, saldo] = await Promise.all([
      listarMovimientos(sede.libroId, {
        limite,
        soloEgresos: true,
        desde,
        concepto,
        establecimiento,
        autorizadoPor,
        incluirAnulados,
      }),
      catalogoCaja(sede.libroId),
      saldoActual(sede.libroId),
    ]);
    return NextResponse.json({
      egresos,
      catalogo,
      saldo,
      periodo,
      esAdmin: Boolean(session.esAdmin),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error" },
      { status: 500 }
    );
  }
}

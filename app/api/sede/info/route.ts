import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/sede/info
 * Devuelve datos de la sede del usuario (financieras disponibles, nombre).
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
  return NextResponse.json({
    id: sede.id,
    nombre: sede.nombre,
    financieras: sede.financieras,
  });
}

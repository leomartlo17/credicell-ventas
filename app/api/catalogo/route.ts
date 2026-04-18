import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { leerCatalogo } from "@/lib/inventario";
import { NextResponse } from "next/server";

/**
 * GET /api/catalogo
 * Devuelve las marcas, equipos (agrupados por marca) y colores que ya
 * existen en el inventario 2026+. Usado por el form de subir producto
 * para poblar los dropdowns.
 */
export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede asignada" }, { status: 403 });
  }

  try {
    const catalogo = await leerCatalogo(sede.libroId);
    return NextResponse.json(catalogo);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error leyendo catálogo" },
      { status: 500 }
    );
  }
}

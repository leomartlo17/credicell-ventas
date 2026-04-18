import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { listarDisponibles, extraerOpciones } from "@/lib/inventario";
import { NextResponse } from "next/server";

/**
 * GET /api/producto/disponibles?marca=X&equipo=Y&color=Z
 * Devuelve los productos disponibles + opciones únicas para dropdowns.
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
  const marca = searchParams.get("marca") || undefined;
  const equipo = searchParams.get("equipo") || undefined;
  const color = searchParams.get("color") || undefined;

  try {
    const productos = await listarDisponibles(sede.libroId, { marca, equipo, color });
    // Para dropdowns usamos TODOS los disponibles sin filtro, para que el
    // usuario pueda cambiar de marca sin quedarse sin opciones.
    const todos = marca || equipo || color
      ? await listarDisponibles(sede.libroId)
      : productos;
    return NextResponse.json({
      productos,
      opciones: extraerOpciones(todos),
      total: productos.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error leyendo inventario" },
      { status: 500 }
    );
  }
}

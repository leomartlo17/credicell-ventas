import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { listarDisponibles } from "@/lib/inventario";

export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ productos: [] }, { status: 401 });
  }
  const sede = session.user as SessionConSede["user"];
  try {
    const productos = await listarDisponibles(sede.libroId);
    return NextResponse.json({ productos });
  } catch (error) {
    console.error("Error al obtener productos disponibles:", error);
    return NextResponse.json({ productos: [] }, { status: 500 });
  }
}

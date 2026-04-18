import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { buscarPorCedula } from "@/lib/clientes";
import { NextResponse } from "next/server";

/**
 * GET /api/cliente/buscar?cedula=123456789
 * Devuelve { encontrado: boolean, cliente?: Cliente }
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
  const cedula = (searchParams.get("cedula") || "").trim();
  if (!cedula || !/^\d{5,12}$/.test(cedula)) {
    return NextResponse.json(
      { error: "Cédula inválida. Debe ser entre 5 y 12 dígitos." },
      { status: 400 }
    );
  }

  try {
    const cliente = await buscarPorCedula(sede.libroId, cedula);
    return NextResponse.json({
      encontrado: cliente !== null,
      cliente,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error al buscar cliente" },
      { status: 500 }
    );
  }
}

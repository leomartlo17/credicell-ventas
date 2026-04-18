import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { crearCliente, buscarPorCedula } from "@/lib/clientes";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  cedula: z.string().regex(/^\d{5,12}$/, "Cédula debe ser 5-12 dígitos"),
  nombre: z.string().min(3, "Nombre muy corto").max(100),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  ciudad: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  fechaNacimiento: z.string().optional(),
  ocupacion: z.string().optional(),
});

/**
 * POST /api/cliente/crear
 * Body: Cliente (ver lib/clientes.ts)
 * Devuelve { ok: true, filaEscrita: number } o { ok: false, error: string }
 */
export async function POST(req: Request) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 }
    );
  }
  const datos = parsed.data;

  try {
    // Evitar duplicados — si ya existe, rechazar
    const existente = await buscarPorCedula(sede.libroId, datos.cedula);
    if (existente) {
      return NextResponse.json(
        {
          ok: false,
          error: `Ya existe un cliente con esa cédula: ${existente.nombre}`,
          clienteExistente: existente,
        },
        { status: 409 }
      );
    }

    const { filaEscrita } = await crearCliente(sede.libroId, datos);
    return NextResponse.json({ ok: true, filaEscrita });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error al crear cliente" },
      { status: 500 }
    );
  }
}

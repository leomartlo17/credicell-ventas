import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { crearProducto } from "@/lib/inventario";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  marca: z.string().min(1, "Marca requerida").max(50),
  equipo: z.string().min(1, "Equipo requerido").max(100),
  tipoEquipo: z.string().optional(),
  color: z.string().optional(),
  imei1: z.string().regex(/^\d{15}$/, "IMEI 1 debe ser exactamente 15 dígitos"),
  imei2: z.string().regex(/^\d{15}$/).optional().or(z.literal("")),
  precioCosto: z.number().nonnegative().optional(),
  proveedor: z.string().optional(),
});

/**
 * POST /api/producto/crear
 * Crea un producto nuevo en el inventario de la sede del usuario.
 * Rechaza duplicados por IMEI (tanto IMEI1 como IMEI2).
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

  try {
    const { filaEscrita } = await crearProducto(sede.libroId, {
      marca: parsed.data.marca,
      equipo: parsed.data.equipo,
      tipoEquipo: parsed.data.tipoEquipo,
      color: parsed.data.color,
      imei1: parsed.data.imei1,
      imei2: parsed.data.imei2 || undefined,
      precioCosto: parsed.data.precioCosto,
      proveedor: parsed.data.proveedor,
    });
    return NextResponse.json({ ok: true, filaEscrita });
  } catch (error: any) {
    const msg = error?.message || "Error al crear producto";
    // Duplicado → 409 para que el UI muestre el mensaje claro
    const status = msg.toLowerCase().includes("ya existe") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

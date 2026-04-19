import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { guardarVenta } from "@/lib/ventas";
import { hojaInventario, buscarPorImei } from "@/lib/inventario";
import { buscarPorCedula } from "@/lib/clientes";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  cedula: z.string().regex(/^\d{5,12}$/),
  imei: z.string().regex(/^\d{15}$/),
  filaInventario: z.number().int().positive(),
  financiera: z.string().min(1),
  valorTotal: z.number().nonnegative(),
  porcentajeCuota: z.number().nonnegative().optional(),
  valorCuota: z.number().nonnegative().optional(),
  efectivo: z.number().nonnegative().optional(),
  caja: z.number().nonnegative().optional(),
  transferencia: z.number().nonnegative().optional(),
  nequi: z.number().nonnegative().optional(),
  datafono: z.number().nonnegative().optional(),
  wompi: z.number().nonnegative().optional(),
  otro: z.number().nonnegative().optional(),
  observaciones: z.string().optional(),
});

export async function POST(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede" }, { status: 403 });
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
  const d = parsed.data;

  try {
    // Validar que el cliente exista (si no, bloqueamos la venta)
    const cliente = await buscarPorCedula(sede.libroId, d.cedula);
    if (!cliente) {
      return NextResponse.json(
        { error: `Cliente con cédula ${d.cedula} no existe. Vuelve a Paso 1.` },
        { status: 400 }
      );
    }

    const hojaInv = await hojaInventario(sede.libroId);
    if (!hojaInv) {
      return NextResponse.json(
        { error: "No hay hoja de inventario todavía. Carga productos primero." },
        { status: 400 }
      );
    }

    const producto = await buscarPorImei(sede.libroId, d.imei);
    if (!producto) {
      return NextResponse.json(
        { error: `No encontré el IMEI ${d.imei} en inventario` },
        { status: 400 }
      );
    }
    if (!producto.disponible) {
      return NextResponse.json(
        { error: `El IMEI ${d.imei} ya fue vendido. Recarga Paso 2.` },
        { status: 409 }
      );
    }

    const asesor = session.user.name || session.user.email || "desconocido";

    const { filaVenta } = await guardarVenta(sede.libroId, hojaInv, {
      cedula: d.cedula,
      clienteNombre: cliente.nombre,
      marca: producto.marca,
      equipo: producto.equipo,
      color: producto.color,
      imei: d.imei,
      filaInventario: d.filaInventario,
      financiera: d.financiera,
      valorTotal: d.valorTotal,
      porcentajeCuota: d.porcentajeCuota,
      valorCuota: d.valorCuota,
      efectivo: d.efectivo,
      caja: d.caja,
      transferencia: d.transferencia,
      nequi: d.nequi,
      datafono: d.datafono,
      wompi: d.wompi,
      otro: d.otro,
      observaciones: d.observaciones,
      asesor,
    });

    return NextResponse.json({ ok: true, filaVenta });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error al guardar venta" },
      { status: 500 }
    );
  }
}

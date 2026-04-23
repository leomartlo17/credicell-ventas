import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { guardarVenta, EntradaPago, puedeCombinarseConCoFinanciera } from "@/lib/ventas";
import { hojaInventario, buscarPorImei } from "@/lib/inventario";
import { buscarPorCedula } from "@/lib/clientes";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Schema del nuevo formato (dinámico): pagos es un array de { medio, valor }.
 * Soporta tanto los medios core como cualquier medio nuevo del catálogo.
 *
 * Se mantiene compat con el formato viejo (efectivo, transferencia, etc.
 * como campos sueltos) por si algún cliente viejo queda cacheado —
 * internamente se convierte a pagos[].
 */
const schema = z.object({
  cedula: z.string().regex(/^\d{5,12}$/),
  imei: z.string().regex(/^\d{15}$/),
  filaInventario: z.number().int().positive(),
  financiera: z.string().min(1),
  valorTotal: z.number().nonnegative(),
  porcentajeCuota: z.number().nonnegative().optional(),
  valorRecibir: z.number().nonnegative().optional(),
  // NUEVO: desglose dinámico
  pagos: z
    .array(
      z.object({
        medio: z.string().min(1).max(30),
        valor: z.number().nonnegative(),
      })
    )
    .optional(),
  // LEGADO: campos individuales (retro-compatibilidad)
  efectivo: z.number().nonnegative().optional(),
  caja: z.number().nonnegative().optional(),
  transferencia: z.number().nonnegative().optional(),
  nequi: z.number().nonnegative().optional(),
  datafono: z.number().nonnegative().optional(),
  wompi: z.number().nonnegative().optional(),
  otro: z.number().nonnegative().optional(),
  observaciones: z.string().optional(),
  pagoComisionAddi: z.string().optional(),
  comisionAddi: z.number().optional(),
  precioAddi: z.number().optional(),
  pagoComisionSupay: z.string().optional(),
  comisionSupay: z.number().optional(),
  precioSupay: z.number().optional(),
  porcentajeRenting: z.number().optional(),
  inicialRenting: z.number().optional(),
  pagoComisionAlcanos: z.string().optional(),
  comisionAlcanos: z.number().optional(),
  precioAlcanos: z.number().optional(),
  // Monto asignado a la financiera principal (si hay co-financiación).
  // Si no viene, se asume que la principal cubre el valorTotal completo.
  valorFinancieraPrincipal: z.number().nonnegative().optional(),
  // Co-financiaciones: N financieras secundarias que cubren partes de la
  // cuota inicial de la principal. La suma de los `valor` debe cuadrar con
  // la cuota inicial (la app valida en front; backend acepta lo que venga).
  coFinanciaciones: z
    .array(
      z.object({
        financiera: z.string().min(1),
        valor: z.number().positive(),
        // Si la secundaria es tipo kredit-cuota (BOGOTA)
        porcentajeCuota: z.number().nonnegative().optional(),
        valorRecibir: z.number().nonnegative().optional(),
        // Si la secundaria es tipo comisión (ADDI / SU+PAY / ALCANOS)
        modoComision: z.string().optional(),
        comisionValor: z.number().nonnegative().optional(),
        precioInflado: z.number().nonnegative().optional(),
      })
    )
    .optional(),
  // Legado — acepta objeto único para compatibilidad
  coFinanciacion: z
    .object({
      financiera: z.string().min(1),
      valor: z.number().positive(),
      porcentajeCuota: z.number().nonnegative().optional(),
      valorRecibir: z.number().nonnegative().optional(),
      modoComision: z.string().optional(),
      comisionValor: z.number().nonnegative().optional(),
      precioInflado: z.number().nonnegative().optional(),
    })
    .optional(),
});

/**
 * Convierte los campos legados (efectivo, transferencia, etc.) a entradas
 * del array pagos[]. Si el cliente ya mandó pagos[], lo usamos directo.
 */
function normalizarPagos(d: z.infer<typeof schema>): EntradaPago[] {
  if (d.pagos && d.pagos.length > 0) {
    return d.pagos.filter((p) => (p.valor || 0) > 0);
  }
  const legacy: EntradaPago[] = [];
  if (d.efectivo && d.efectivo > 0) legacy.push({ medio: "EFECTIVO", valor: d.efectivo });
  if (d.caja && d.caja > 0) legacy.push({ medio: "CAJA", valor: d.caja });
  if (d.transferencia && d.transferencia > 0)
    legacy.push({ medio: "TRANSFERENCIA", valor: d.transferencia });
  if (d.nequi && d.nequi > 0) legacy.push({ medio: "NEQUI", valor: d.nequi });
  if (d.datafono && d.datafono > 0) legacy.push({ medio: "DATAFONO", valor: d.datafono });
  if (d.wompi && d.wompi > 0) legacy.push({ medio: "WOMPI", valor: d.wompi });
  if (d.otro && d.otro > 0) legacy.push({ medio: "OTRO", valor: d.otro });
  return legacy;
}

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
    const pagos = normalizarPagos(d);

    // Validar regla de co-financiación para cada una (KREDIYA/+KUPO/ADELANTOS
    // no se combinan entre sí). Aplica tanto al array nuevo como al legado.
    const todasCofs = [
      ...(d.coFinanciaciones || []),
      ...(d.coFinanciacion ? [d.coFinanciacion] : []),
    ];
    for (const cof of todasCofs) {
      const chk = puedeCombinarseConCoFinanciera(d.financiera, cof.financiera);
      if (!chk.ok) {
        return NextResponse.json(
          { error: chk.razon || "Co-financiación inválida" },
          { status: 400 }
        );
      }
    }

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
      valorRecibir: d.valorRecibir,
      pagos,
      observaciones: d.observaciones,
      pagoComisionAddi: d.pagoComisionAddi,
      comisionAddi: d.comisionAddi,
      precioAddi: d.precioAddi,
      pagoComisionSupay: d.pagoComisionSupay,
      comisionSupay: d.comisionSupay,
      precioSupay: d.precioSupay,
      porcentajeRenting: d.porcentajeRenting,
      inicialRenting: d.inicialRenting,
      pagoComisionAlcanos: d.pagoComisionAlcanos,
      comisionAlcanos: d.comisionAlcanos,
      precioAlcanos: d.precioAlcanos,
      valorFinancieraPrincipal: d.valorFinancieraPrincipal,
      coFinanciacion: d.coFinanciacion,
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

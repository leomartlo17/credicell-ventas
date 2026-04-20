/**
 * Helper de ventas.
 * Al cerrar una venta (Paso 3) escribimos en VARIAS hojas:
 *   1. 'Inventario android 2026': marca equipo VENDIDO (FECHA VENTA + ESTADO)
 *   2. 'Ventas 2026': fila resumen legible (1 fila por venta, columnas fijas
 *      para los medios core — legibilidad humana)
 *   3. 'DETALLE_PAGOS': filas granulares (1 fila por CADA medio usado —
 *      fuente de verdad para auditoría al peso, permite medios dinámicos)
 *   4. Hoja financiera específica (KREDIYA 2026, PAYJOY 2026) si aplica —
 *      solo financieras con estructura de conciliación ya definida
 *   5. 'Caja 2026': ingreso si hubo efectivo
 *
 * Regla Leonardo: todo se registra, nada se borra. Una venta puede quedar
 * registrada en hasta 5 pestañas distintas — cada una sirve a un propósito
 * diferente (auditoría, conciliación, caja).
 */
import {
  leerRango,
  listarHojas,
  agregarFila,
  actualizarCelda,
  crearHoja,
  escribirRango,
} from "@/lib/google-sheets";
import { buscarPorImei } from "@/lib/inventario";
import {
  MEDIOS_CORE,
  normalizarNombreMedio,
  escribirDetallePagos,
} from "@/lib/medios-pago";

export const HOJA_VENTAS = "Ventas 2026";

/**
 * Porcentajes de cuota inicial estándar que ofrecen las financieras.
 */
export const PORCENTAJES_INICIAL = [20, 25, 30, 35, 40, 45, 50] as const;

/**
 * Por ahora solo KREDIYA y PAYJOY generan hoja propia con conciliación.
 */
const FINANCIERAS_CON_HOJA_PROPIA = ["KREDIYA", "PAYJOY"];

/**
 * Headers de las hojas de conciliación por financiera (KREDIYA, PAYJOY).
 */
const HEADERS_FINANCIERA = [
  "FECHA",
  "ASESOR",
  "CEDULA",
  "CLIENTE",
  "MARCA",
  "EQUIPO",
  "COLOR",
  "IMEI",
  "VALOR VENTA",
  "% INICIAL",
  "VALOR %",
  "VALOR RECIBIDO",
  "DESCUENTO",
  "VALOR FINANCIADO",
  "EFECTIVO",
  "CAJA",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
  "OTRO",
  "OBSERVACIONES",
  "PAGO COMISION ADDI",
  "COMISION ADDI",
  "PRECIO ADDI",
  "PAGO COMISION SUPAY",
  "COMISION SUPAY",
  "PRECIO SUPAY",
];

const HEADERS_VENTAS = [
  "FECHA",
  "ASESOR",
  "CEDULA",
  "CLIENTE",
  "MARCA",
  "EQUIPO",
  "COLOR",
  "IMEI",
  "FINANCIERA",
  "VALOR TOTAL",
  "% CUOTA",
  "VALOR CUOTA",
  "EFECTIVO",
  "CAJA",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
  "OTRO",
  "TOTAL ABONADO",
  "OBSERVACIONES",
];

/**
 * Una entrada del desglose de pagos. El medio viene tal cual del catálogo
 * (nombre normalizado UPPERCASE). Este es el formato unificado entre
 * frontend → API → guardarVenta → DETALLE_PAGOS.
 */
export type EntradaPago = {
  medio: string;
  valor: number;
};

export type VentaInput = {
  cedula: string;
  clienteNombre: string;
  marca: string;
  equipo: string;
  color: string;
  imei: string;
  filaInventario: number;
  financiera: string;
  valorTotal: number;
  porcentajeCuota?: number;
  /**
   * Solo para KREDIYA / PAYJOY. Es la cuota inicial REAL que el asesor
   * cobra al cliente — puede ser menor al valor % oficial cuando se le
   * hace descuento. La suma de medios de pago debe cuadrar con este valor.
   */
  valorRecibir?: number;
  /**
   * Desglose completo de medios de pago. Cada entrada es un medio del
   * catálogo con su valor. Los medios fuera de los core se agrupan en
   * "OTRO" en Ventas 2026 y quedan granulares en DETALLE_PAGOS.
   */
  pagos: EntradaPago[];
  observaciones?: string;
  pagoComisionAddi?: string;
  comisionAddi?: number;
  precioAddi?: number;
  pagoComisionSupay?: string;
  comisionSupay?: number;
  precioSupay?: number;
  asesor: string;
};

async function asegurarHojaVentas(libroId: string): Promise<string> {
  const hojas = await listarHojas(libroId);
  if (hojas.includes(HOJA_VENTAS)) return HOJA_VENTAS;
  await crearHoja(libroId, HOJA_VENTAS);
  await escribirRango(libroId, `'${HOJA_VENTAS}'!A1`, [HEADERS_VENTAS]);
  return HOJA_VENTAS;
}

function nombreHojaFinanciera(financiera: string): string | null {
  const f = (financiera || "").trim().toUpperCase();
  if (!f) return null;
  if (!FINANCIERAS_CON_HOJA_PROPIA.includes(f)) return null;
  return `${f} 2026`;
}

async function asegurarHojaFinanciera(
  libroId: string,
  financiera: string
): Promise<string | null> {
  const nombre = nombreHojaFinanciera(financiera);
  if (!nombre) return null;
  const hojas = await listarHojas(libroId);
  if (hojas.includes(nombre)) return nombre;
  await crearHoja(libroId, nombre);
  await escribirRango(libroId, `'${nombre}'!A1`, [HEADERS_FINANCIERA]);
  return nombre;
}

async function marcarVendidoEnInventario(
  libroId: string,
  hojaInv: string,
  filaNumero: number,
  fechaVenta: string
): Promise<void> {
  const headerRow = await leerRango(libroId, `'${hojaInv}'!A1:Z1`);
  const headers = (headerRow[0] || []).map((x) => String(x || "").toUpperCase());
  let idxFechaVenta = -1;
  let idxEstado = -1;
  for (let i = 0; i < headers.length; i++) {
    if (idxFechaVenta < 0 && headers[i].includes("FECHA") && headers[i].includes("VENTA")) {
      idxFechaVenta = i;
    }
    if (idxEstado < 0 && (headers[i].includes("ESTADO") || headers[i].includes("STATUS"))) {
      idxEstado = i;
    }
  }
  const letraCol = (i: number) => String.fromCharCode(65 + i);
  if (idxFechaVenta >= 0) {
    await actualizarCelda(
      libroId,
      `'${hojaInv}'!${letraCol(idxFechaVenta)}${filaNumero}`,
      fechaVenta
    );
  }
  if (idxEstado >= 0) {
    await actualizarCelda(
      libroId,
      `'${hojaInv}'!${letraCol(idxEstado)}${filaNumero}`,
      "VENDIDO"
    );
  }
}

/**
 * Agrupa un array de EntradaPago en un mapa de monto por medio core.
 * Medios dinámicos (no-core) se suman en el balde "OTRO" y se listan en
 * un texto "detalle" para adjuntar a OBSERVACIONES — así el resumen de
 * Ventas 2026 no pierde info aunque el medio no tenga columna propia.
 */
function agruparPagosParaResumen(pagos: EntradaPago[]): {
  core: Record<string, number>;
  detalleOtros: string;
  total: number;
} {
  const coreSet = new Set<string>(MEDIOS_CORE);
  const core: Record<string, number> = {};
  for (const m of MEDIOS_CORE) core[m] = 0;

  const otrosMap: Record<string, number> = {};
  let total = 0;

  for (const p of pagos) {
    const medio = normalizarNombreMedio(p.medio);
    const valor = Number(p.valor) || 0;
    if (valor <= 0) continue;
    total += valor;
    if (coreSet.has(medio)) {
      core[medio] = (core[medio] || 0) + valor;
    } else {
      // Medio dinámico → sumarlo al balde OTRO y recordar el detalle
      core["OTRO"] = (core["OTRO"] || 0) + valor;
      otrosMap[medio] = (otrosMap[medio] || 0) + valor;
    }
  }

  const detalleOtros = Object.entries(otrosMap)
    .map(
      ([medio, valor]) => `${medio}: $${valor.toLocaleString("es-CO")}`
    )
    .join(" | ");

  return { core, detalleOtros, total };
}

/**
 * Ejecuta el cierre de venta completo. Ver doc del archivo arriba para
 * las pestañas que toca. Lanza error si el equipo ya no está disponible
 * o si alguna escritura falla en Sheets.
 */
export async function guardarVenta(
  libroId: string,
  hojaInv: string,
  venta: VentaInput
): Promise<{ ok: true; filaVenta: number }> {
  // Re-verificar que no lo hayan vendido en paralelo
  const prod = await buscarPorImei(libroId, venta.imei);
  if (!prod) throw new Error(`IMEI ${venta.imei} no existe en inventario`);
  if (!prod.disponible) {
    throw new Error(
      `El equipo IMEI ${venta.imei} ya fue vendido. Recarga el inventario.`
    );
  }

  const fechaHoy = new Date().toISOString().slice(0, 10);

  // 1) Marcar vendido en inventario
  await marcarVendidoEnInventario(libroId, hojaInv, venta.filaInventario, fechaHoy);

  // Normalizar y agrupar el desglose de pagos
  const pagosLimpios: EntradaPago[] = (venta.pagos || [])
    .map((p) => ({
      medio: normalizarNombreMedio(p.medio),
      valor: Number(p.valor) || 0,
    }))
    .filter((p) => p.valor > 0 && p.medio);

  const { core, detalleOtros, total: totalAbonado } =
    agruparPagosParaResumen(pagosLimpios);

  // Cálculos específicos para financiera (si aplica)
  const pct = venta.porcentajeCuota || 0;
  const valorPctOficial = pct > 0 ? Math.round((venta.valorTotal * pct) / 100) : 0;
  const valorRecibir =
    venta.valorRecibir !== undefined && venta.valorRecibir !== null
      ? venta.valorRecibir
      : totalAbonado;
  const descuento = valorPctOficial > 0 ? valorPctOficial - valorRecibir : 0;
  const valorFinanciado = pct > 0 ? venta.valorTotal - valorPctOficial : 0;

  // Observaciones enriquecidas con el detalle de medios dinámicos
  const observacionesFinal = [
    venta.observaciones?.trim(),
    detalleOtros ? `[Otros medios: ${detalleOtros}]` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 2) Escribir fila resumen en Ventas 2026
  const hojaVen = await asegurarHojaVentas(libroId);
  const filaVentas = [
    fechaHoy,
    venta.asesor,
    venta.cedula,
    venta.clienteNombre,
    venta.marca,
    venta.equipo,
    venta.color || "",
    venta.imei,
    venta.financiera,
    venta.valorTotal,
    venta.porcentajeCuota ?? "",
    "", // VALOR CUOTA (legado — ahora se usa valorRecibir en KREDIYA/PAYJOY)
    core["EFECTIVO"] || "",
    core["CAJA"] || "",
    core["TRANSFERENCIA"] || "",
    core["NEQUI"] || "",
    core["DATAFONO"] || "",
    core["WOMPI"] || "",
    core["OTRO"] || "",
    totalAbonado,
    observacionesFinal,
    venta.pagoComisionAddi ?? "",
    venta.comisionAddi ?? "",
    venta.precioAddi ?? "",
    venta.pagoComisionSupay ?? "",
    venta.comisionSupay ?? "",
    venta.precioSupay ?? "",
  ];
  const { filaEscrita } = await agregarFila(libroId, hojaVen, filaVentas);

  // 3) Escribir DETALLE_PAGOS — fila por cada medio usado (fuente granular)
  await escribirDetallePagos(libroId, {
    fecha: fechaHoy,
    ventaId: filaEscrita,
    cedula: venta.cedula,
    cliente: venta.clienteNombre,
    imei: venta.imei,
    asesor: venta.asesor,
    financiera: venta.financiera,
    pagos: pagosLimpios,
  });

  // 4) Hoja de conciliación financiera (solo KREDIYA / PAYJOY)
  const hojaFin = await asegurarHojaFinanciera(libroId, venta.financiera);
  if (hojaFin) {
    const filaFinanciera = [
      fechaHoy,
      venta.asesor,
      venta.cedula,
      venta.clienteNombre,
      venta.marca,
      venta.equipo,
      venta.color || "",
      venta.imei,
      venta.valorTotal,
      venta.porcentajeCuota ?? "",
      valorPctOficial || "",
      valorRecibir,
      descuento,
      valorFinanciado || "",
      core["EFECTIVO"] || "",
      core["CAJA"] || "",
      core["TRANSFERENCIA"] || "",
      core["NEQUI"] || "",
      core["DATAFONO"] || "",
      core["WOMPI"] || "",
      core["OTRO"] || "",
      observacionesFinal,
    ];
    await agregarFila(libroId, hojaFin, filaFinanciera);
  }

  // 5) Si hubo efectivo, registrar INGRESO en Caja 2026
  const efectivoTotal = core["EFECTIVO"] || 0;
  if (efectivoTotal > 0) {
    const { registrarMovimiento } = await import("@/lib/caja");
    await registrarMovimiento(libroId, {
      tipo: "INGRESO",
      concepto:
        venta.financiera.toUpperCase() === "CONTADO"
          ? "VENTA CONTADO"
          : "INICIAL CREDITO",
      establecimiento: venta.clienteNombre,
      monto: efectivoTotal,
      asesor: venta.asesor,
      referencia: `IMEI ${venta.imei} · CC ${venta.cedula}`,
      observaciones: `Efectivo de ${venta.marca} ${venta.equipo} (${venta.financiera})`,
    });
  }

  return { ok: true, filaVenta: filaEscrita };
}

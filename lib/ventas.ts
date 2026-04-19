/**
 * Helper de ventas.
 * Al cerrar una venta (Paso 3) hacen falta DOS escrituras en Google Sheets:
 *   1. Marcar el equipo vendido en 'Inventario android 2026':
 *      - columna FECHA VENTA con la fecha de hoy
 *      - columna ESTADO con "VENDIDO" (para quede visible al auxiliar
 *        contable cuando mire la hoja manual)
 *   2. Agregar una fila a 'Ventas 2026' con todos los datos de la venta.
 *      Esta hoja se crea automáticamente si no existe.
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

export const HOJA_VENTAS = "Ventas 2026";

/**
 * Porcentajes de cuota inicial estándar que ofrecen las financieras.
 * Leonardo: la financiera oficialmente fija uno de estos, pero en práctica
 * a veces se le hace descuento al cliente y se recibe menos.
 */
export const PORCENTAJES_INICIAL = [20, 25, 30, 35, 40, 45, 50] as const;

/**
 * Por ahora solo KREDIYA y PAYJOY generan hoja propia con conciliación
 * semanal. Las demás financieras (ADELANTOS, +KUPO, BOGOTA, ADDI, SU+PAY,
 * RENTING, ALCANOS) se agregarán cuando Leonardo defina cómo funciona
 * cada una — hasta entonces sus ventas solo van a Ventas 2026.
 */
const FINANCIERAS_CON_HOJA_PROPIA = ["KREDIYA", "PAYJOY"];

/**
 * Headers de las hojas de conciliación por financiera (KREDIYA, PAYJOY).
 * VALOR FINANCIADO = VALOR VENTA − VALOR % = lo que la financiera le va
 * pagando a Leonardo semanalmente en cuotas.
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
  "VALOR FINANCIADO",
  "VALOR RECIBIDO",
  "DESCUENTO",
  "EFECTIVO",
  "CAJA",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
  "OTRO",
  "OBSERVACIONES",
];

/**
 * Medios de pago soportados. Cada venta puede tener un monto en cualquier
 * combinación de ellos. La suma debe cuadrar con lo abonado (el valor total
 * en Contado, o la cuota inicial cuando hay financiera).
 */
export const MEDIOS_PAGO = [
  "EFECTIVO",
  "CAJA",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
  "OTRO",
] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

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
  valorCuota?: number;
  // Medios de pago individuales
  efectivo?: number;
  caja?: number;
  transferencia?: number;
  nequi?: number;
  datafono?: number;
  wompi?: number;
  otro?: number;
  observaciones?: string;
  asesor: string;
};

async function asegurarHojaVentas(libroId: string): Promise<string> {
  const hojas = await listarHojas(libroId);
  if (hojas.includes(HOJA_VENTAS)) return HOJA_VENTAS;
  await crearHoja(libroId, HOJA_VENTAS);
  await escribirRango(libroId, `'${HOJA_VENTAS}'!A1`, [HEADERS_VENTAS]);
  return HOJA_VENTAS;
}

/**
 * Genera el nombre de la hoja de conciliación de una financiera, SOLO
 * si es una financiera con estructura semanal ya definida (KREDIYA,
 * PAYJOY). Para las demás, null → la venta solo queda en Ventas 2026
 * hasta que Leonardo defina cómo conciliar cada una.
 */
function nombreHojaFinanciera(financiera: string): string | null {
  const f = (financiera || "").trim().toUpperCase();
  if (!f) return null;
  if (!FINANCIERAS_CON_HOJA_PROPIA.includes(f)) return null;
  return `${f} 2026`;
}

/**
 * Si la venta es por KREDIYA o PAYJOY, asegura que exista la hoja de
 * conciliación con los headers correctos. Retorna el nombre de la hoja
 * o null si la financiera no tiene estructura definida todavía.
 */
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

/**
 * Marca un equipo como vendido en la hoja de inventario.
 * Actualiza FECHA VENTA y ESTADO de la fila.
 */
async function marcarVendidoEnInventario(
  libroId: string,
  hojaInv: string,
  filaNumero: number,
  fechaVenta: string
): Promise<void> {
  // Leer la fila de headers para saber cuáles columnas actualizar
  const headerRow = await leerRango(libroId, `'${hojaInv}'!A1:Z1`);
  const headers = (headerRow[0] || []).map((x) => String(x || "").toUpperCase());
  // Index de FECHA VENTA y ESTADO
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
  // Actualizar celdas encontradas
  const letraCol = (i: number) => {
    // soporta A..Z (0-25). El inventario nunca llega a más.
    return String.fromCharCode(65 + i);
  };
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
 * Ejecuta el cierre de venta completo:
 *   - Verifica que el equipo sigue disponible (evita doble venta).
 *   - Marca el equipo como vendido en inventario.
 *   - Escribe fila nueva en Ventas 2026.
 *
 * Lanza error si el equipo ya no está disponible o si algo falla en Sheets.
 */
export async function guardarVenta(
  libroId: string,
  hojaInv: string,
  venta: VentaInput
): Promise<{ ok: true; filaVenta: number }> {
  // Re-verificar que no lo hayan vendido en paralelo (otra pestaña, otro asesor)
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

  // Total abonado (suma de todos los medios de pago) = lo que entró en caja hoy
  const totalAbonado =
    (venta.efectivo || 0) +
    (venta.caja || 0) +
    (venta.transferencia || 0) +
    (venta.nequi || 0) +
    (venta.datafono || 0) +
    (venta.wompi || 0) +
    (venta.otro || 0);

  // Cálculos específicos para financiera (si aplica)
  const pct = venta.porcentajeCuota || 0;
  const valorPctOficial = pct > 0 ? Math.round((venta.valorTotal * pct) / 100) : 0;
  const descuento = valorPctOficial > 0 ? valorPctOficial - totalAbonado : 0;
  // VALOR FINANCIADO = lo que la financiera le paga a Leonardo en cuotas
  // = valor venta menos el % inicial oficial
  const valorFinanciado = pct > 0 ? venta.valorTotal - valorPctOficial : 0;

  // 2) Asegurar hoja de Ventas + escribir fila general (todas las ventas)
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
    venta.valorCuota ?? "",
    venta.efectivo ?? "",
    venta.caja ?? "",
    venta.transferencia ?? "",
    venta.nequi ?? "",
    venta.datafono ?? "",
    venta.wompi ?? "",
    venta.otro ?? "",
    totalAbonado,
    venta.observaciones || "",
  ];
  const { filaEscrita } = await agregarFila(libroId, hojaVen, filaVentas);

  // 3) Escribir en hoja de la financiera (solo si NO es Contado).
  //    Esta es la hoja de conciliación para que Leonardo cuadre con cada
  //    financiera lo que les debe pagar semanal/mensual.
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
      valorFinanciado || "",       // VALOR FINANCIADO (lo que pagará la financiera)
      totalAbonado,                // VALOR RECIBIDO
      descuento,                   // DESCUENTO
      venta.efectivo ?? "",
      venta.caja ?? "",
      venta.transferencia ?? "",
      venta.nequi ?? "",
      venta.datafono ?? "",
      venta.wompi ?? "",
      venta.otro ?? "",
      venta.observaciones || "",
    ];
    await agregarFila(libroId, hojaFin, filaFinanciera);
  }

  return { ok: true, filaVenta: filaEscrita };
}

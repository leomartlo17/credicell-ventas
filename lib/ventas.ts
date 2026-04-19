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

  // Total abonado (suma de todos los medios de pago)
  const totalAbonado =
    (venta.efectivo || 0) +
    (venta.caja || 0) +
    (venta.transferencia || 0) +
    (venta.nequi || 0) +
    (venta.datafono || 0) +
    (venta.wompi || 0) +
    (venta.otro || 0);

  // 2) Asegurar hoja de Ventas + escribir fila
  const hojaVen = await asegurarHojaVentas(libroId);
  const fila = [
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
  const { filaEscrita } = await agregarFila(libroId, hojaVen, fila);
  return { ok: true, filaVenta: filaEscrita };
}

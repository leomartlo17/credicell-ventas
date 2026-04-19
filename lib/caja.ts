/**
 * Helper de caja — lee la hoja Ventas 2026 y calcula totales por medio
 * de pago (efectivo, transferencia, Nequi, datáfono, Wompi, caja, otro)
 * para darle a Leonardo un panorama del dinero entrado por canal.
 *
 * Filtra siempre por 2026+ (regla universal) y permite filtrar por
 * período: hoy, mes actual, últimos 30 días, o todo.
 */
import {
  leerRango,
  listarHojas,
  agregarFila,
  crearHoja,
  escribirRango,
} from "@/lib/google-sheets";
import { HOJA_VENTAS } from "@/lib/ventas";
import { MEDIOS_CORE } from "@/lib/medios-pago";

/**
 * Los totales por medio en el panel de caja se calculan solo sobre los
 * medios CORE (columnas fijas de Ventas 2026). Los medios dinámicos del
 * catálogo se agregan al balde OTRO del resumen — pero conservan detalle
 * granular en la pestaña DETALLE_PAGOS si alguien quiere auditar al peso.
 */
type MedioPago = (typeof MEDIOS_CORE)[number];

/**
 * Hoja dedicada al movimiento de EFECTIVO físico de la sede. Registra
 * cada peso que entra (por venta en efectivo, por abono de cuota, etc.)
 * y cada peso que sale (pago a proveedor, gasto de aseo, transporte…).
 * El saldo actual se calcula sumando ingresos y restando egresos.
 */
export const HOJA_CAJA = "Caja 2026";

const HEADERS_CAJA = [
  "FECHA",
  "HORA",
  "TIPO", // INGRESO | EGRESO
  "CONCEPTO", // VENTA, CUOTA, PROVEEDOR, ASEO, etc.
  "ESTABLECIMIENTO", // a quien se le pago / de donde vino
  "MONTO",
  "SALDO DESPUES",
  "ASESOR",
  "REFERENCIA", // IMEI si es venta, cedula si es cuota, numero factura si es gasto
  "FOTO FACTURA", // URL de la imagen (cuando aplica, egresos)
  "PRESTAMO OTRA SEDE", // SI/NO — si el efectivo salio para una compra de otra sede
  "OBSERVACIONES",
];

export type TipoMovimiento = "INGRESO" | "EGRESO";

export type MovimientoCaja = {
  tipo: TipoMovimiento;
  concepto: string;
  establecimiento?: string;
  monto: number;
  asesor: string;
  referencia?: string;
  urlFactura?: string;
  prestamoOtraSede?: boolean;
  observaciones?: string;
};

async function asegurarHojaCaja(libroId: string): Promise<string> {
  const hojas = await listarHojas(libroId);
  if (hojas.includes(HOJA_CAJA)) return HOJA_CAJA;
  await crearHoja(libroId, HOJA_CAJA);
  await escribirRango(libroId, `'${HOJA_CAJA}'!A1`, [HEADERS_CAJA]);
  return HOJA_CAJA;
}

/**
 * Registra un movimiento en la hoja Caja 2026. Recalcula el saldo actual
 * (ingresos − egresos hasta ese momento) y lo escribe en la columna
 * SALDO DESPUES para que Leonardo pueda abrir la hoja y ver el acumulado
 * sin fórmulas.
 */
export async function registrarMovimiento(
  libroId: string,
  mov: MovimientoCaja
): Promise<{ filaEscrita: number; saldoDespues: number }> {
  const hoja = await asegurarHojaCaja(libroId);

  // Calcular saldo actual para poner en columna SALDO DESPUES
  const saldoAntes = await saldoActual(libroId);
  const delta = mov.tipo === "INGRESO" ? mov.monto : -mov.monto;
  const saldoDespues = saldoAntes + delta;

  const ahora = new Date();
  const fecha = ahora.toISOString().slice(0, 10);
  const hora = ahora.toTimeString().slice(0, 5);

  const fila = [
    fecha,
    hora,
    mov.tipo,
    (mov.concepto || "").trim(),
    (mov.establecimiento || "").trim(),
    mov.monto,
    saldoDespues,
    mov.asesor,
    (mov.referencia || "").trim(),
    (mov.urlFactura || "").trim(),
    mov.prestamoOtraSede ? "SI" : "",
    (mov.observaciones || "").trim(),
  ];
  const { filaEscrita } = await agregarFila(libroId, hoja, fila);
  return { filaEscrita, saldoDespues };
}

/**
 * Calcula el saldo actual de efectivo = suma de INGRESOS − suma de EGRESOS
 * en la hoja Caja 2026 (considerando solo filas con fecha 2026+).
 * Si la hoja no existe todavía retorna 0.
 */
export async function saldoActual(libroId: string): Promise<number> {
  const hojas = await listarHojas(libroId);
  if (!hojas.includes(HOJA_CAJA)) return 0;
  const filas = await leerRango(libroId, `'${HOJA_CAJA}'!A1:Z`);
  if (filas.length < 2) return 0;

  const headers = (filas[0] || []).map((x) => String(x || "").toUpperCase());
  const idxTipo = headers.findIndex((h) => h.trim() === "TIPO");
  const idxMonto = headers.findIndex((h) => h.trim() === "MONTO");
  if (idxTipo < 0 || idxMonto < 0) return 0;

  let saldo = 0;
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const tipo = String(fila[idxTipo] || "").toUpperCase().trim();
    const monto = parseNumero(fila[idxMonto]);
    if (tipo === "INGRESO") saldo += monto;
    else if (tipo === "EGRESO") saldo -= monto;
  }
  return saldo;
}

/**
 * Lista los últimos N movimientos de caja, ordenados de más reciente
 * a más antiguo (por orden de fila en la hoja — el más abajo es el más
 * nuevo).
 */
export async function listarMovimientos(
  libroId: string,
  limite: number = 20
): Promise<Array<MovimientoCaja & { fecha: string; hora: string; saldoDespues: number; fila: number }>> {
  const hojas = await listarHojas(libroId);
  if (!hojas.includes(HOJA_CAJA)) return [];
  const filas = await leerRango(libroId, `'${HOJA_CAJA}'!A1:Z`);
  if (filas.length < 2) return [];

  const headers = (filas[0] || []).map((x) => String(x || "").toUpperCase().trim());
  const col = (n: string) => headers.findIndex((h) => h === n);
  const ixs = {
    fecha: col("FECHA"),
    hora: col("HORA"),
    tipo: col("TIPO"),
    concepto: col("CONCEPTO"),
    establecimiento: col("ESTABLECIMIENTO"),
    monto: col("MONTO"),
    saldo: col("SALDO DESPUES"),
    asesor: col("ASESOR"),
    referencia: col("REFERENCIA"),
    foto: col("FOTO FACTURA"),
    prestamo: col("PRESTAMO OTRA SEDE"),
    obs: col("OBSERVACIONES"),
  };

  const result: Array<any> = [];
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] || [];
    if (!f[ixs.tipo]) continue;
    result.push({
      fila: i + 1,
      fecha: String(f[ixs.fecha] || ""),
      hora: String(f[ixs.hora] || ""),
      tipo: String(f[ixs.tipo] || "").toUpperCase() as TipoMovimiento,
      concepto: String(f[ixs.concepto] || ""),
      establecimiento: String(f[ixs.establecimiento] || ""),
      monto: parseNumero(f[ixs.monto]),
      saldoDespues: parseNumero(f[ixs.saldo]),
      asesor: String(f[ixs.asesor] || ""),
      referencia: String(f[ixs.referencia] || ""),
      urlFactura: String(f[ixs.foto] || ""),
      prestamoOtraSede: String(f[ixs.prestamo] || "").toUpperCase() === "SI",
      observaciones: String(f[ixs.obs] || ""),
    });
  }
  // Más reciente primero
  return result.reverse().slice(0, limite);
}

/**
 * Lee todos los conceptos y establecimientos ya usados en Caja 2026,
 * para poblar los dropdowns del form de egreso. Si la hoja no existe,
 * retorna listas predeterminadas.
 */
export async function catalogoCaja(libroId: string): Promise<{
  conceptos: string[];
  establecimientos: string[];
}> {
  const predeterminados = {
    conceptos: [
      "PROVEEDOR CELULARES",
      "PROVEEDOR ACCESORIOS",
      "ASEO",
      "PAPELERIA",
      "TRANSPORTE",
      "SERVICIOS PUBLICOS",
      "ALIMENTACION",
      "MANTENIMIENTO",
      "OTRO",
    ],
    establecimientos: [],
  };
  const hojas = await listarHojas(libroId);
  if (!hojas.includes(HOJA_CAJA)) return predeterminados;

  const filas = await leerRango(libroId, `'${HOJA_CAJA}'!A1:Z`);
  if (filas.length < 2) return predeterminados;

  const headers = (filas[0] || []).map((x) => String(x || "").toUpperCase().trim());
  const idxTipo = headers.findIndex((h) => h === "TIPO");
  const idxConc = headers.findIndex((h) => h === "CONCEPTO");
  const idxEst = headers.findIndex((h) => h === "ESTABLECIMIENTO");

  const conceptosSet = new Set<string>(predeterminados.conceptos);
  const establecimientosSet = new Set<string>();

  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] || [];
    if (String(f[idxTipo] || "").toUpperCase() !== "EGRESO") continue;
    const c = String(f[idxConc] || "").trim();
    if (c) conceptosSet.add(c);
    const e = String(f[idxEst] || "").trim();
    if (e) establecimientosSet.add(e);
  }

  return {
    conceptos: [...conceptosSet].sort(),
    establecimientos: [...establecimientosSet].sort(),
  };
}

export type Periodo = "hoy" | "mes" | "30dias" | "todo";

export type ResumenCaja = {
  totalVentas: number;       // total facturado (suma de VALOR TOTAL)
  totalAbonado: number;      // total efectivamente cobrado hoy (suma de medios)
  pendienteFinanciera: number; // ventas - abonado = lo cubre financiera
  contadorVentas: number;
  porMedio: Record<MedioPago, number>;
  porFinanciera: Record<string, number>;
  periodo: Periodo;
  desde: string | null;
  hasta: string | null;
};

function normalizarHeader(s: string): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .trim();
}

/**
 * Dado los headers de Ventas 2026, construye un mapa
 * nombreColumna -> indiceColumna (0-indexed).
 */
function mapearColumnasVentas(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const n = normalizarHeader(String(h));
    if (!n) return;
    if (map[n] === undefined) map[n] = i;
  });
  return map;
}

function parseNumero(v: any): number {
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Parsea una fecha que puede venir como:
 * - string "2026-04-19" (ISO)
 * - string "19/04/2026" (dd/mm/yyyy)
 * - string "4/19/2026" (mm/dd/yyyy, Sheets en US locale)
 * - number (serial date de Google)
 *
 * Retorna Date o null si no se pudo parsear.
 */
function parsearFecha(v: any): Date | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    // Serial date Sheets → Date. Día 0 = 1899-12-30.
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms);
  }
  const s = String(v).trim();
  // ISO
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  // dd/mm/yyyy o mm/dd/yyyy — asumimos dd/mm/yyyy porque locale ES
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = Number(dmy[3]);
    // Si primer grupo > 12, es claramente día → dd/mm
    // Si segundo > 12, mm/dd
    // Si ambos <=12, ambiguo — asumimos dd/mm (convención Colombia)
    if (a > 12) return new Date(y, b - 1, a);
    if (b > 12) return new Date(y, a - 1, b);
    return new Date(y, b - 1, a);
  }
  // dd-mm-yyyy
  const dmy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmy2) {
    return new Date(Number(dmy2[3]), Number(dmy2[2]) - 1, Number(dmy2[1]));
  }
  return null;
}

function filtroDesde(periodo: Periodo): Date | null {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  switch (periodo) {
    case "hoy":
      return hoy;
    case "mes":
      return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    case "30dias": {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "todo":
    default:
      return null;
  }
}

export async function resumenCaja(
  libroId: string,
  periodo: Periodo = "mes"
): Promise<ResumenCaja> {
  const vacio: ResumenCaja = {
    totalVentas: 0,
    totalAbonado: 0,
    pendienteFinanciera: 0,
    contadorVentas: 0,
    porMedio: MEDIOS_CORE.reduce(
      (acc, m) => ({ ...acc, [m]: 0 }),
      {} as Record<MedioPago, number>
    ),
    porFinanciera: {},
    periodo,
    desde: null,
    hasta: null,
  };

  const hojas = await listarHojas(libroId);
  if (!hojas.includes(HOJA_VENTAS)) return vacio;

  const filas = await leerRango(libroId, `'${HOJA_VENTAS}'!A1:Z`);
  if (filas.length < 2) return vacio;

  const headers = (filas[0] || []).map((x) => String(x));
  const cols = mapearColumnasVentas(headers);

  const col = (clave: string) => (cols[clave] !== undefined ? cols[clave] : -1);
  const idxFecha = col("FECHA");
  const idxFinanciera = col("FINANCIERA");
  const idxTotal = col("VALOR TOTAL");
  const idxTotalAbonado = col("TOTAL ABONADO");
  // Medios
  const idxMedios: Record<MedioPago, number> = {
    EFECTIVO: col("EFECTIVO"),
    CAJA: col("CAJA"),
    TRANSFERENCIA: col("TRANSFERENCIA"),
    NEQUI: col("NEQUI"),
    DATAFONO: col("DATAFONO"),
    WOMPI: col("WOMPI"),
    OTRO: col("OTRO"),
  };

  const desdeFecha = filtroDesde(periodo);
  const hoyFin = new Date();

  const resumen: ResumenCaja = {
    ...vacio,
    porMedio: { ...vacio.porMedio },
    porFinanciera: {},
    desde: desdeFecha ? desdeFecha.toISOString().slice(0, 10) : null,
    hasta: hoyFin.toISOString().slice(0, 10),
  };

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    if (idxFecha < 0) continue;
    const fecha = parsearFecha(fila[idxFecha]);
    if (!fecha) continue;
    // Solo 2026+
    if (fecha.getFullYear() < 2026) continue;
    if (desdeFecha && fecha < desdeFecha) continue;

    const total = idxTotal >= 0 ? parseNumero(fila[idxTotal]) : 0;
    const abonadoFila =
      idxTotalAbonado >= 0
        ? parseNumero(fila[idxTotalAbonado])
        : MEDIOS_CORE.reduce(
            (acc, m) =>
              acc +
              (idxMedios[m] >= 0 ? parseNumero(fila[idxMedios[m]]) : 0),
            0
          );

    resumen.contadorVentas++;
    resumen.totalVentas += total;
    resumen.totalAbonado += abonadoFila;

    for (const medio of MEDIOS_CORE) {
      const idx = idxMedios[medio];
      if (idx >= 0) {
        resumen.porMedio[medio] += parseNumero(fila[idx]);
      }
    }

    if (idxFinanciera >= 0) {
      const fin = String(fila[idxFinanciera] || "").trim();
      if (fin) {
        resumen.porFinanciera[fin] = (resumen.porFinanciera[fin] || 0) + total;
      }
    }
  }

  resumen.pendienteFinanciera = resumen.totalVentas - resumen.totalAbonado;
  return resumen;
}

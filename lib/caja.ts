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
  "TIPO", // INGRESO | EGRESO | ANULACION
  "CONCEPTO",
  "ESTABLECIMIENTO",
  "MONTO",
  "SALDO DESPUES",
  "ASESOR",
  "REFERENCIA",
  "FOTO FACTURA",
  "PRESTAMO OTRA SEDE",
  "OBSERVACIONES",
  "AUTORIZADO POR", // J.A, J.D, u otro — obligatorio si monto > UMBRAL_AUTORIZACION
  "ANULA FILA", // número de fila que esta fila anula (solo para TIPO=ANULACION)
  "ANULADO EN FILA", // número de fila que anula a esta (si está presente, esta fila quedó anulada)
];

/**
 * Umbrales de reglas para egresos. Cambiar aquí cambia la validación en
 * toda la app (front+back). Montos en pesos colombianos.
 */
export const UMBRAL_FACTURA = 20_000; // > de este → URL factura obligatoria
export const UMBRAL_AUTORIZACION = 100_000; // > de este → AUTORIZADO POR obligatorio

export type TipoMovimiento = "INGRESO" | "EGRESO" | "ANULACION";

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
  /** Quién autorizó el egreso. Obligatorio si monto > UMBRAL_AUTORIZACION. */
  autorizadoPor?: string;
  /** Si es TIPO=ANULACION, la fila de Caja 2026 que esta anula. */
  anulaFila?: number;
};

async function asegurarHojaCaja(libroId: string): Promise<string> {
  const hojas = await listarHojas(libroId);
  if (hojas.includes(HOJA_CAJA)) {
    // Auto-migración suave: si la hoja existe pero le faltan columnas
    // nuevas (AUTORIZADO POR, ANULA FILA, ANULADO EN FILA), las agregamos
    // al final sin tocar data existente. Idempotente.
    await asegurarHeadersCaja(libroId);
    return HOJA_CAJA;
  }
  await crearHoja(libroId, HOJA_CAJA);
  await escribirRango(libroId, `'${HOJA_CAJA}'!A1`, [HEADERS_CAJA]);
  return HOJA_CAJA;
}

/**
 * Asegura que la hoja Caja 2026 tenga todos los headers actuales. Si
 * faltan columnas nuevas (ej. AUTORIZADO POR), las agrega al final sin
 * tocar datos existentes. Idempotente — si ya están todas, no hace nada.
 */
async function asegurarHeadersCaja(libroId: string): Promise<void> {
  const fila1 = await leerRango(libroId, `'${HOJA_CAJA}'!A1:Z1`);
  const existentes = (fila1[0] || []).map((x) =>
    String(x || "").toUpperCase().trim()
  );
  const faltantes = HEADERS_CAJA.filter((h) => !existentes.includes(h));
  if (faltantes.length === 0) return;
  // Escribir headers completos (existentes + nuevos al final)
  const nuevaFila = [...existentes.map((_, i) => (fila1[0] || [])[i] || ""), ...faltantes];
  await escribirRango(libroId, `'${HOJA_CAJA}'!A1`, [nuevaFila]);
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

  // Validaciones de egresos con reglas estrictas
  if (mov.tipo === "EGRESO") {
    if (mov.monto > UMBRAL_FACTURA && !mov.urlFactura?.trim()) {
      throw new Error(
        `Foto de factura obligatoria para egresos > $${UMBRAL_FACTURA.toLocaleString("es-CO")}`
      );
    }
    if (mov.monto > UMBRAL_AUTORIZACION && !mov.autorizadoPor?.trim()) {
      throw new Error(
        `Autorización obligatoria para egresos > $${UMBRAL_AUTORIZACION.toLocaleString("es-CO")}. ` +
          `Registra quién autorizó (J.A, J.D, u otro).`
      );
    }
  }

  // Calcular saldo actual para poner en columna SALDO DESPUES
  const saldoAntes = await saldoActual(libroId);
  let delta = 0;
  if (mov.tipo === "INGRESO") {
    delta = mov.monto;
  } else if (mov.tipo === "EGRESO") {
    delta = -mov.monto;
  } else if (mov.tipo === "ANULACION") {
    // Una anulación invierte el signo del movimiento original
    delta = mov.monto;
  }
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
    (mov.autorizadoPor || "").trim(),
    mov.anulaFila ? mov.anulaFila : "",
    "", // ANULADO EN FILA — lo escribimos después en anularMovimiento
  ];
  const { filaEscrita } = await agregarFila(libroId, hoja, fila);
  return { filaEscrita, saldoDespues };
}

/**
 * Anula un movimiento existente. Regla Leonardo: nada se borra. Crea una
 * fila nueva TIPO=ANULACION con el monto inverso, y marca la fila original
 * con ANULADO EN FILA = nueva fila. El saldo se recalcula automáticamente
 * — saldoActual() ignora pares original+anulación.
 */
export async function anularMovimiento(
  libroId: string,
  filaAnular: number,
  motivo: string,
  asesor: string
): Promise<{ filaAnulacion: number; saldoDespues: number }> {
  const hoja = await asegurarHojaCaja(libroId);
  const filas = await leerRango(libroId, `'${hoja}'!A1:Z`);
  if (filas.length < 2) {
    throw new Error("Caja vacía — no hay movimientos para anular");
  }
  if (filaAnular < 2 || filaAnular > filas.length) {
    throw new Error(`Fila ${filaAnular} no existe en Caja 2026`);
  }

  const headers = (filas[0] || []).map((x) =>
    String(x || "").toUpperCase().trim()
  );
  const colMap = mapearColumnasCaja(headers);
  const orig = filas[filaAnular - 1] || [];

  const tipoOrig = String(orig[colMap.tipo] || "").toUpperCase().trim();
  if (tipoOrig === "ANULACION") {
    throw new Error("No se puede anular una anulación");
  }
  const anuladoEnFila =
    colMap.anuladoEnFila >= 0
      ? String(orig[colMap.anuladoEnFila] || "").trim()
      : "";
  if (anuladoEnFila) {
    throw new Error(
      `Este movimiento ya fue anulado en la fila ${anuladoEnFila}`
    );
  }

  const monto = parseNumero(orig[colMap.monto]);
  const concepto = String(orig[colMap.concepto] || "");
  const establecimiento = String(orig[colMap.establecimiento] || "");
  const referencia = String(orig[colMap.referencia] || "");

  // Crear fila de anulación
  const { filaEscrita: filaAnulacion, saldoDespues } = await registrarMovimiento(
    libroId,
    {
      tipo: "ANULACION",
      concepto: `ANULA ${tipoOrig}: ${concepto}`,
      establecimiento,
      // Para ANULACION el monto que guardamos es siempre positivo;
      // el signo se calcula en registrarMovimiento (delta invertido).
      monto: tipoOrig === "INGRESO" ? -monto : monto,
      asesor,
      referencia,
      observaciones: motivo,
      anulaFila: filaAnular,
    }
  );

  // Marcar la fila original como ANULADO EN FILA = filaAnulacion
  // La columna es dinámica según headers actuales.
  if (colMap.anuladoEnFila >= 0) {
    const letra = colLetra(colMap.anuladoEnFila);
    const { actualizarCelda } = await import("@/lib/google-sheets");
    await actualizarCelda(
      libroId,
      `'${hoja}'!${letra}${filaAnular}`,
      filaAnulacion
    );
  }

  return { filaAnulacion, saldoDespues };
}

/**
 * Convierte índice de columna (0-based) a letra de Sheets (A..Z, AA..ZZ).
 * Soporta hasta 702 columnas — suficiente para nuestro caso.
 */
function colLetra(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

type ColMapCaja = {
  fecha: number;
  hora: number;
  tipo: number;
  concepto: number;
  establecimiento: number;
  monto: number;
  saldoDespues: number;
  asesor: number;
  referencia: number;
  fotoFactura: number;
  prestamo: number;
  observaciones: number;
  autorizadoPor: number;
  anulaFila: number;
  anuladoEnFila: number;
};

function mapearColumnasCaja(headers: string[]): ColMapCaja {
  const col = (n: string) => headers.findIndex((h) => h === n);
  return {
    fecha: col("FECHA"),
    hora: col("HORA"),
    tipo: col("TIPO"),
    concepto: col("CONCEPTO"),
    establecimiento: col("ESTABLECIMIENTO"),
    monto: col("MONTO"),
    saldoDespues: col("SALDO DESPUES"),
    asesor: col("ASESOR"),
    referencia: col("REFERENCIA"),
    fotoFactura: col("FOTO FACTURA"),
    prestamo: col("PRESTAMO OTRA SEDE"),
    observaciones: col("OBSERVACIONES"),
    autorizadoPor: col("AUTORIZADO POR"),
    anulaFila: col("ANULA FILA"),
    anuladoEnFila: col("ANULADO EN FILA"),
  };
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

  const headers = (filas[0] || []).map((x) =>
    String(x || "").toUpperCase().trim()
  );
  const cols = mapearColumnasCaja(headers);
  if (cols.tipo < 0 || cols.monto < 0) return 0;

  // Primer pase: identificar filas anuladas (que tienen ANULADO EN FILA
  // con valor) y filas de anulación (TIPO=ANULACION). Ambas grupos se
  // excluyen del cálculo del saldo, por lo que el neto de un par
  // (movimiento+anulación) es cero.
  const anuladas = new Set<number>();
  const anulaciones = new Set<number>();
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] || [];
    const tipo = String(f[cols.tipo] || "").toUpperCase().trim();
    if (tipo === "ANULACION") anulaciones.add(i + 1);
    if (cols.anuladoEnFila >= 0) {
      const ae = String(f[cols.anuladoEnFila] || "").trim();
      if (ae) anuladas.add(i + 1);
    }
  }

  let saldo = 0;
  for (let i = 1; i < filas.length; i++) {
    const filaNum = i + 1;
    if (anuladas.has(filaNum) || anulaciones.has(filaNum)) continue;
    const fila = filas[i] || [];
    const tipo = String(fila[cols.tipo] || "").toUpperCase().trim();
    const monto = parseNumero(fila[cols.monto]);
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
export type MovimientoEnriquecido = MovimientoCaja & {
  fecha: string;
  hora: string;
  saldoDespues: number;
  fila: number;
  anuladoEnFila?: number;
  /** true si este movimiento tiene una anulación (no suma al saldo). */
  anulado: boolean;
  /** true si este movimiento ES una anulación de otra fila. */
  esAnulacion: boolean;
};

export async function listarMovimientos(
  libroId: string,
  opciones: {
    limite?: number;
    soloEgresos?: boolean;
    soloIngresos?: boolean;
    desde?: Date | null;
    hasta?: Date | null;
    concepto?: string;
    establecimiento?: string;
    autorizadoPor?: string;
    incluirAnulados?: boolean;
  } = {}
): Promise<MovimientoEnriquecido[]> {
  const {
    limite = 20,
    soloEgresos = false,
    soloIngresos = false,
    desde = null,
    hasta = null,
    concepto,
    establecimiento,
    autorizadoPor,
    incluirAnulados = true,
  } = opciones;

  const hojas = await listarHojas(libroId);
  if (!hojas.includes(HOJA_CAJA)) return [];
  const filas = await leerRango(libroId, `'${HOJA_CAJA}'!A1:Z`);
  if (filas.length < 2) return [];

  const headers = (filas[0] || []).map((x) =>
    String(x || "").toUpperCase().trim()
  );
  const ixs = mapearColumnasCaja(headers);

  const result: MovimientoEnriquecido[] = [];
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] || [];
    if (!f[ixs.tipo]) continue;
    const tipo = String(f[ixs.tipo] || "").toUpperCase() as TipoMovimiento;
    const filaNum = i + 1;
    const anuladoEnFilaRaw =
      ixs.anuladoEnFila >= 0 ? String(f[ixs.anuladoEnFila] || "").trim() : "";
    const anuladoEnFila = anuladoEnFilaRaw
      ? parseInt(anuladoEnFilaRaw, 10)
      : undefined;
    const anulado = Boolean(anuladoEnFila);
    const esAnulacion = tipo === "ANULACION";

    // Filtros
    if (soloEgresos && tipo !== "EGRESO" && !esAnulacion) continue;
    if (soloIngresos && tipo !== "INGRESO") continue;
    if (!incluirAnulados && (anulado || esAnulacion)) continue;

    const fechaStr = String(f[ixs.fecha] || "");
    if (desde || hasta) {
      const fechaMov = parsearFecha(fechaStr);
      if (desde && (!fechaMov || fechaMov < desde)) continue;
      if (hasta && (!fechaMov || fechaMov > hasta)) continue;
    }
    if (
      concepto &&
      !String(f[ixs.concepto] || "")
        .toUpperCase()
        .includes(concepto.toUpperCase())
    )
      continue;
    if (
      establecimiento &&
      !String(f[ixs.establecimiento] || "")
        .toUpperCase()
        .includes(establecimiento.toUpperCase())
    )
      continue;
    if (
      autorizadoPor &&
      ixs.autorizadoPor >= 0 &&
      !String(f[ixs.autorizadoPor] || "")
        .toUpperCase()
        .includes(autorizadoPor.toUpperCase())
    )
      continue;

    result.push({
      fila: filaNum,
      fecha: fechaStr,
      hora: String(f[ixs.hora] || ""),
      tipo,
      concepto: String(f[ixs.concepto] || ""),
      establecimiento: String(f[ixs.establecimiento] || ""),
      monto: parseNumero(f[ixs.monto]),
      saldoDespues: parseNumero(f[ixs.saldoDespues]),
      asesor: String(f[ixs.asesor] || ""),
      referencia: String(f[ixs.referencia] || ""),
      urlFactura:
        ixs.fotoFactura >= 0 ? String(f[ixs.fotoFactura] || "") : "",
      prestamoOtraSede:
        ixs.prestamo >= 0
          ? String(f[ixs.prestamo] || "").toUpperCase() === "SI"
          : false,
      observaciones:
        ixs.observaciones >= 0 ? String(f[ixs.observaciones] || "") : "",
      autorizadoPor:
        ixs.autorizadoPor >= 0 ? String(f[ixs.autorizadoPor] || "") : "",
      anulaFila:
        ixs.anulaFila >= 0 && f[ixs.anulaFila]
          ? parseInt(String(f[ixs.anulaFila]), 10)
          : undefined,
      anuladoEnFila,
      anulado,
      esAnulacion,
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

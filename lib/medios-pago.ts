/**
 * Helper para el catálogo MEDIOS_PAGO y la pestaña granular DETALLE_PAGOS.
 *
 * Arquitectura de pagos (acuerdo con Leonardo):
 *   - MEDIOS_PAGO (catálogo maestro): lista de medios activos. Admins
 *     agregan medios nuevos sin tocar código. Los medios que ya no se
 *     usen se MARCAN inactivos (nunca se borran — regla "nada se pierde").
 *   - DETALLE_PAGOS (fuente de verdad granular): una fila por CADA medio
 *     usado en CADA venta. Para auditar al peso quién pagó con qué.
 *   - Ventas 2026 (resumen legible): sigue como hasta hoy con columnas
 *     fijas para los medios "core". Medios nuevos fuera de la lista core
 *     se suman al campo "OTRO" y se detallan en OBSERVACIONES automáticas
 *     para mantener retrocompatibilidad con lo que Leonardo ya tenía.
 *
 * Los nombres del catálogo se almacenan en UPPERCASE, sin espacios extra,
 * únicos. La validación impide crear "Nequi" y "NEQUI" como dos medios.
 */
import {
  leerRango,
  listarHojas,
  agregarFila,
  crearHoja,
  escribirRango,
  actualizarCelda,
} from "@/lib/google-sheets";

export const HOJA_MEDIOS = "MEDIOS_PAGO";
export const HOJA_DETALLE_PAGOS = "DETALLE_PAGOS";

const HEADERS_MEDIOS = [
  "NOMBRE",
  "ACTIVO",
  "FECHA_CREACION",
  "CREADO_POR",
  "OBSERVACIONES",
];

const HEADERS_DETALLE_PAGOS = [
  "FECHA",
  "VENTA_ID",
  "CEDULA",
  "CLIENTE",
  "IMEI",
  "MEDIO",
  "VALOR",
  "ASESOR",
  "FINANCIERA",
];

/**
 * Medios "core" — los que tienen columna dedicada en Ventas 2026 y
 * hojas de conciliación (KREDIYA, ADELANTOS, +KUPO, BOGOTA, etc.). Son
 * los que ya existían antes
 * de hacer el catálogo dinámico. Si agregas un medio NUEVO al catálogo,
 * caerá agrupado bajo "OTRO" en el resumen de Ventas 2026 — pero queda
 * desglosado fila-por-fila en DETALLE_PAGOS.
 *
 * Regla: cambiar esta lista implica cambiar headers de Ventas 2026 y
 * hojas de financieras (migración manual en Sheets). Por eso se tocan
 * con mucho cuidado.
 */
export const MEDIOS_CORE = [
  "EFECTIVO",
  "CAJA",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
  "OTRO",
] as const;

/**
 * Medios que el asesor PUEDE seleccionar directamente en Paso 3 y que
 * aparecen en la UI admin de /admin/medios-pago.
 *
 * OTRO es estructural (columna fija en Ventas 2026 para absorber medios
 * dinámicos fuera del set) y CAJA es saldo físico de la sede, no un medio
 * que el cliente use — ambos se excluyen de cualquier selector.
 *
 * Regla firme Leonardo: "todo debe tener nombre, no OTRO". Si hace falta
 * un medio nuevo, el admin lo crea con su nombre real (DAVIPLATA, BRE-B,
 * etc.) y queda registrado en el catálogo para todas las ventas.
 */
const MEDIOS_OCULTOS = new Set(["OTRO", "CAJA"]);

/**
 * Seed inicial del catálogo MEDIOS_PAGO. No incluye OTRO ni CAJA.
 */
const MEDIOS_SEED = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
];

export type MedioCatalogo = {
  nombre: string;
  activo: boolean;
  fechaCreacion: string;
  creadoPor: string;
  observaciones: string;
  /** Fila 1-indexed en la hoja — necesaria para updates (desactivar). */
  fila: number;
  /** true si es uno de los medios históricos con columna fija en Ventas 2026. */
  esCore: boolean;
};

/**
 * Normaliza un nombre de medio: trim + uppercase + colapsa espacios.
 * El catálogo se almacena así para evitar duplicados por capitalización.
 */
export function normalizarNombreMedio(nombre: string): string {
  return (nombre || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Se asegura de que la pestaña MEDIOS_PAGO exista con los medios "core"
 * sembrados como activos. Idempotente — si ya existe, no hace nada.
 *
 * Este método corre automático la primera vez que un admin abre
 * /admin/medios-pago o cuando se cierra una venta.
 */
export async function asegurarHojaMedios(
  libroId: string,
  creadoPor: string
): Promise<void> {
  const hojas = await listarHojas(libroId);
  if (hojas.includes(HOJA_MEDIOS)) return;

  await crearHoja(libroId, HOJA_MEDIOS);
  const hoy = new Date().toISOString().slice(0, 10);
  const filas: any[][] = [HEADERS_MEDIOS];
  for (const m of MEDIOS_SEED) {
    filas.push([m, "SI", hoy, creadoPor, "medio base (seed inicial)"]);
  }
  await escribirRango(libroId, `'${HOJA_MEDIOS}'!A1`, filas);
}

/**
 * Se asegura de que la pestaña DETALLE_PAGOS exista con sus headers.
 * Esta pestaña es la fuente de verdad granular para auditar cada peso.
 */
export async function asegurarHojaDetallePagos(libroId: string): Promise<void> {
  const hojas = await listarHojas(libroId);
  if (hojas.includes(HOJA_DETALLE_PAGOS)) return;
  await crearHoja(libroId, HOJA_DETALLE_PAGOS);
  await escribirRango(
    libroId,
    `'${HOJA_DETALLE_PAGOS}'!A1`,
    [HEADERS_DETALLE_PAGOS]
  );
}

/**
 * Lee el catálogo completo (activos + inactivos).
 * Si la hoja no existe todavía, la crea con los seed y retorna los core.
 */
export async function listarMedios(
  libroId: string,
  creadoPor: string
): Promise<MedioCatalogo[]> {
  await asegurarHojaMedios(libroId, creadoPor);
  const filas = await leerRango(libroId, `'${HOJA_MEDIOS}'!A1:E`);
  if (filas.length < 2) return [];

  const coreSet = new Set<string>(MEDIOS_CORE);
  const out: MedioCatalogo[] = [];
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] || [];
    const nombre = String(f[0] || "").trim();
    if (!nombre) continue;
    // Excluir medios "ocultos" (OTRO, CAJA) — aunque estén en la hoja
    // por seeds viejos, no deben surgir en ninguna UI. Quedan como
    // columnas estructurales de Ventas 2026 / conciliaciones.
    if (MEDIOS_OCULTOS.has(nombre)) continue;
    const activo = String(f[1] || "").trim().toUpperCase() === "SI";
    out.push({
      nombre,
      activo,
      fechaCreacion: String(f[2] || ""),
      creadoPor: String(f[3] || ""),
      observaciones: String(f[4] || ""),
      fila: i + 1, // 1-indexed, +1 por header
      esCore: coreSet.has(nombre),
    });
  }
  return out;
}

/**
 * Lista solo los medios ACTIVOS — los que deben aparecer como inputs en
 * el Paso 3 del formulario de venta. Ordenados: core primero (orden
 * histórico), luego los nuevos alfabéticamente.
 */
export async function listarMediosActivos(
  libroId: string,
  creadoPor: string
): Promise<MedioCatalogo[]> {
  const todos = await listarMedios(libroId, creadoPor);
  const activos = todos.filter((m) => m.activo);
  const coreOrden = new Map<string, number>();
  (MEDIOS_CORE as readonly string[]).forEach((m, i) => coreOrden.set(m, i));
  activos.sort((a, b) => {
    const aIdx = coreOrden.has(a.nombre) ? coreOrden.get(a.nombre)! : 999;
    const bIdx = coreOrden.has(b.nombre) ? coreOrden.get(b.nombre)! : 999;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.nombre.localeCompare(b.nombre);
  });
  return activos;
}

/**
 * Crea un medio nuevo. Falla si ya existe (activo o inactivo) con el
 * mismo nombre normalizado — no queremos duplicados ni siquiera
 * "escondidos" como inactivos.
 */
export async function crearMedio(
  libroId: string,
  nombreRaw: string,
  creadoPor: string,
  observaciones?: string
): Promise<MedioCatalogo> {
  const nombre = normalizarNombreMedio(nombreRaw);
  if (!nombre || nombre.length < 2) {
    throw new Error("El nombre del medio debe tener al menos 2 caracteres");
  }
  if (nombre.length > 30) {
    throw new Error("El nombre del medio es muy largo (máx 30 caracteres)");
  }
  if (MEDIOS_OCULTOS.has(nombre)) {
    throw new Error(
      `"${nombre}" es un nombre reservado del sistema. Usa un nombre real ` +
        `(ej: DAVIPLATA, BRE-B, BANCOLOMBIA). Regla: todos los pagos deben ` +
        `tener nombre real, no genérico.`
    );
  }
  const todos = await listarMedios(libroId, creadoPor);
  if (todos.some((m) => m.nombre === nombre)) {
    throw new Error(`El medio "${nombre}" ya existe en el catálogo`);
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const fila = [nombre, "SI", hoy, creadoPor, observaciones || ""];
  const { filaEscrita } = await agregarFila(libroId, HOJA_MEDIOS, fila);
  return {
    nombre,
    activo: true,
    fechaCreacion: hoy,
    creadoPor,
    observaciones: observaciones || "",
    fila: filaEscrita,
    esCore: (MEDIOS_CORE as readonly string[]).includes(nombre),
  };
}

/**
 * Activa o desactiva un medio (soft delete). Nunca se borran filas.
 * Los medios "core" NO se pueden desactivar — son estructurales para
 * las hojas de Ventas 2026 y conciliaciones.
 */
export async function cambiarEstadoMedio(
  libroId: string,
  nombre: string,
  activar: boolean,
  creadoPor: string
): Promise<void> {
  const nombreNorm = normalizarNombreMedio(nombre);
  if ((MEDIOS_CORE as readonly string[]).includes(nombreNorm)) {
    throw new Error(
      `No se puede desactivar "${nombreNorm}" — es un medio base del sistema`
    );
  }
  const todos = await listarMedios(libroId, creadoPor);
  const m = todos.find((x) => x.nombre === nombreNorm);
  if (!m) throw new Error(`Medio "${nombreNorm}" no existe`);
  // Columna B = ACTIVO
  await actualizarCelda(
    libroId,
    `'${HOJA_MEDIOS}'!B${m.fila}`,
    activar ? "SI" : "NO"
  );
}

/**
 * Escribe N filas en DETALLE_PAGOS — una por cada medio usado en una
 * venta. Esta es la fuente de verdad para auditoría granular.
 *
 * Se llama desde guardarVenta() después de escribir la fila resumen en
 * Ventas 2026, pasando el VENTA_ID (número de fila de Ventas 2026) como
 * ancla para cruzar resumen ↔ detalle.
 */
export async function escribirDetallePagos(
  libroId: string,
  entrada: {
    fecha: string;
    ventaId: number;
    cedula: string;
    cliente: string;
    imei: string;
    asesor: string;
    financiera: string;
    pagos: { medio: string; valor: number }[];
  }
): Promise<void> {
  const filtrados = entrada.pagos.filter((p) => (p.valor || 0) > 0);
  if (filtrados.length === 0) return; // Nada que registrar

  await asegurarHojaDetallePagos(libroId);

  // Una llamada por fila — podríamos optimizar con batchUpdate pero el
  // volumen es bajo (<10 medios por venta) y la claridad pesa más aquí.
  for (const p of filtrados) {
    await agregarFila(libroId, HOJA_DETALLE_PAGOS, [
      entrada.fecha,
      entrada.ventaId,
      entrada.cedula,
      entrada.cliente,
      entrada.imei,
      normalizarNombreMedio(p.medio),
      p.valor,
      entrada.asesor,
      entrada.financiera,
    ]);
  }
}

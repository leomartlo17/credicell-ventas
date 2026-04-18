/**
 * Helper del inventario android.
 * Lee la hoja "Inventario android" del libro de cada sede y devuelve los
 * productos DISPONIBLES (no vendidos todavía) para mostrarlos en Paso 2.
 *
 * Columnas esperadas (orden flexible, se buscan por nombre):
 *   FECHA INGRESO | MARCA | EQUIPO | IMEI 1 | IMEI 2 | COLOR |
 *   PRECIO COSTO | FECHA VENTA | ESTADO | PROVEEDOR
 *
 * Reglas de negocio:
 *   - "Samsung A17" y "Samsung A17 5G" son referencias distintas → NO
 *     normalizamos el nombre del equipo, se compara tal cual.
 *   - IMEIs deben ser exactamente 15 dígitos → validado en el API.
 *   - Un producto está DISPONIBLE si la columna FECHA VENTA está vacía
 *     (independiente de lo que diga ESTADO).
 */
import {
  leerRango,
  listarHojas,
  agregarFila,
  crearHoja,
  escribirRango,
} from "@/lib/google-sheets";

/**
 * Nombre de la hoja dedicada al inventario 2026+.
 * Regla de Leonardo: trabajamos en una hoja nueva para no confundirnos con
 * los datos históricos desordenados. La app la crea automáticamente la
 * primera vez que se agrega un producto.
 */
export const HOJA_INVENTARIO = "Inventario android 2026";

/**
 * Headers fijos — orden definido para que la hoja sea legible para todos.
 */
const HEADERS_INVENTARIO = [
  "FECHA INGRESO",
  "MARCA",
  "EQUIPO",
  "IMEI 1",
  "IMEI 2",
  "COLOR",
  "PRECIO COSTO",
  "FECHA VENTA",
  "ESTADO",
  "PROVEEDOR",
];

export type Producto = {
  marca: string;
  equipo: string;
  color: string;
  imei: string;        // IMEI 1 — el principal
  imei2?: string;      // IMEI 2 — opcional (equipos dual SIM)
  precioCosto?: number;
  fechaIngreso?: string;
  estado?: string;
  proveedor?: string;
  /** Fila en la hoja (1-indexed) — necesaria para marcar como vendido después. */
  fila: number;
};

function normalizar(s: string): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .trim();
}

export type ColMapInventario = {
  fechaIngreso: number;
  marca: number;
  equipo: number;
  imei1: number;
  imei2: number;
  color: number;
  precioCosto: number;
  fechaVenta: number;
  estado: number;
  proveedor: number;
};

export function mapearColumnasInventario(headers: string[]): ColMapInventario {
  const h = headers.map((x) => normalizar(x));
  const find = (keywords: string[]): number => {
    for (let i = 0; i < h.length; i++) {
      for (const kw of keywords) {
        if (h[i].includes(kw)) return i;
      }
    }
    return -1;
  };
  const findImei = (num: number): number => {
    // Buscar "IMEI 1" o "IMEI1" o "IMEI" (sin número = imei1)
    for (let i = 0; i < h.length; i++) {
      if (h[i] === `IMEI ${num}` || h[i] === `IMEI${num}`) return i;
    }
    if (num === 1) {
      // Si no hay "IMEI 1" explícito, "IMEI" a secas es el primero
      for (let i = 0; i < h.length; i++) {
        if (h[i] === "IMEI") return i;
      }
    }
    return -1;
  };
  return {
    fechaIngreso: find(["FECHA INGRESO", "F INGRESO", "INGRESO"]),
    marca: find(["MARCA"]),
    equipo: find(["EQUIPO", "MODELO", "REFERENCIA"]),
    imei1: findImei(1),
    imei2: findImei(2),
    color: find(["COLOR"]),
    precioCosto: find(["PRECIO COSTO", "COSTO"]),
    fechaVenta: find(["FECHA VENTA", "F VENTA"]),
    estado: find(["ESTADO"]),
    proveedor: find(["PROVEEDOR"]),
  };
}

/**
 * Localiza la hoja de inventario 2026. Solo mira el nombre EXACTO de la hoja
 * nueva que creamos para este sistema. Ignora cualquier hoja vieja con
 * "inventario" en el nombre para no mezclarnos con datos sucios.
 *
 * Retorna null si la hoja no existe todavía (caller decide si crearla).
 */
export async function hojaInventario(libroId: string): Promise<string | null> {
  const hojas = await listarHojas(libroId);
  return hojas.includes(HOJA_INVENTARIO) ? HOJA_INVENTARIO : null;
}

/**
 * Se asegura de que la hoja "Inventario android 2026" exista. Si no, la
 * crea con los headers fijos. Retorna el nombre de la hoja.
 *
 * Se usa antes de escribir (crearProducto) — para las lecturas no forzamos
 * la creación, simplemente retornamos vacío si no existe.
 */
export async function asegurarHojaInventario(libroId: string): Promise<string> {
  const existente = await hojaInventario(libroId);
  if (existente) return existente;

  // No existía — crearla
  await crearHoja(libroId, HOJA_INVENTARIO);
  await escribirRango(libroId, `'${HOJA_INVENTARIO}'!A1`, [HEADERS_INVENTARIO]);
  return HOJA_INVENTARIO;
}

/**
 * Año mínimo — regla de Leonardo: datos anteriores a 2026 están sucios
 * y deben ignorarse para evitar confusión del sistema.
 */
const ANIO_MINIMO = 2026;

/**
 * Detecta la fila de headers escaneando las primeras N filas y eligiendo la
 * que tiene más columnas reconocibles (MARCA, EQUIPO, IMEI, etc.). Útil
 * cuando la hoja tiene un título en la fila 1 o contenido histórico arriba
 * antes de los headers reales.
 */
function detectarHeaderRow(filasTotales: any[][]): {
  headerRowIndex: number;
  headers: string[];
  dataRows: any[][];
} {
  const maxScan = Math.min(30, filasTotales.length);
  let mejorIndex = -1;
  let mejorScore = 0;
  for (let i = 0; i < maxScan; i++) {
    const row = (filasTotales[i] || []).map((x) => normalizar(String(x || "")));
    const keywords = ["MARCA", "EQUIPO", "IMEI", "COLOR", "MODELO", "REFERENCIA"];
    let score = 0;
    for (const cell of row) {
      for (const kw of keywords) {
        if (cell.includes(kw)) {
          score++;
          break;
        }
      }
    }
    if (score > mejorScore) {
      mejorScore = score;
      mejorIndex = i;
    }
  }
  if (mejorIndex === -1 || mejorScore < 2) {
    throw new Error(
      `No encontré fila de headers válida en las primeras ${maxScan} filas. ` +
        `Necesito al menos 2 columnas con nombres como MARCA, EQUIPO, IMEI, COLOR. ` +
        `Primeras filas: ${filasTotales
          .slice(0, Math.min(6, filasTotales.length))
          .map((r, idx) => `[${idx + 1}] ${(r || []).join(" | ")}`)
          .join(" // ")}`
    );
  }
  return {
    headerRowIndex: mejorIndex,
    headers: (filasTotales[mejorIndex] || []).map((x) => String(x)),
    dataRows: filasTotales.slice(mejorIndex + 1),
  };
}

/**
 * Determina si una fila corresponde al período 2026 o posterior, mirando
 * la columna FECHA INGRESO. Regla de negocio: ignoramos todo lo anterior
 * porque los registros históricos están desordenados y pueden confundir
 * la lógica (columnas desplazadas, estados inconsistentes, etc.).
 *
 * - Si no existe la columna FECHA INGRESO, retornamos true (no podemos filtrar).
 * - Si la celda es número (serial date de Sheets), 46023 = 2026-01-01.
 * - Si la celda es string, buscamos un año con patrón 20XX y comparamos.
 * - Si no hay año detectable, retornamos false (preferimos excluir a incluir
 *   ruido).
 */
function esDe2026OPosterior(fila: any[], cols: ColMapInventario): boolean {
  if (cols.fechaIngreso < 0) return true;
  const fi = fila[cols.fechaIngreso];
  if (fi === undefined || fi === null) return false;
  if (typeof fi === "number") {
    // Serial date de Google Sheets: 46023 = 2026-01-01 (25569 epoch + 20454)
    return fi >= 46023;
  }
  const s = String(fi).trim();
  if (s === "") return false;
  const match = s.match(/20\d{2}/);
  if (!match) return false;
  return parseInt(match[0], 10) >= ANIO_MINIMO;
}

function filaAProducto(
  fila: any[],
  cols: ColMapInventario,
  filaNumero: number
): Producto {
  const num = (v: any): number | undefined => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? undefined : n;
  };
  return {
    marca: String(fila[cols.marca] || ""),
    equipo: String(fila[cols.equipo] || ""),
    color: cols.color >= 0 ? String(fila[cols.color] || "") : "",
    imei: cols.imei1 >= 0 ? String(fila[cols.imei1] || "") : "",
    imei2: cols.imei2 >= 0 ? String(fila[cols.imei2] || "") : undefined,
    precioCosto: cols.precioCosto >= 0 ? num(fila[cols.precioCosto]) : undefined,
    fechaIngreso:
      cols.fechaIngreso >= 0 ? String(fila[cols.fechaIngreso] || "") : undefined,
    estado: cols.estado >= 0 ? String(fila[cols.estado] || "") : undefined,
    proveedor: cols.proveedor >= 0 ? String(fila[cols.proveedor] || "") : undefined,
    fila: filaNumero,
  };
}

function estaDisponible(fila: any[], cols: ColMapInventario): boolean {
  // DISPONIBLE = FECHA VENTA vacía Y ESTADO no sea "VENDIDO" / "DEVOLUCION" /
  // "RESERVADO". La fecha de venta es la verdad principal; si esa existe,
  // el equipo se fue. También chequeamos ESTADO por si FECHA VENTA quedó
  // vacía pero marcaron VENDIDO a mano.
  if (cols.fechaVenta >= 0) {
    const fv = fila[cols.fechaVenta];
    if (fv !== undefined && fv !== null && String(fv).trim() !== "") {
      return false; // tiene fecha de venta → está vendido
    }
  }
  if (cols.estado >= 0) {
    const est = normalizar(String(fila[cols.estado] || ""));
    if (
      est.includes("VENDIDO") ||
      est.includes("RESERVADO") ||
      est.includes("DEVOLUCION") ||
      est.includes("GARANTIA")
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Lista productos DISPONIBLES, con filtros opcionales.
 * Filtros son case-insensitive y sin acentos.
 */
export async function listarDisponibles(
  libroId: string,
  filtro?: { marca?: string; equipo?: string; color?: string }
): Promise<Producto[]> {
  const hoja = await hojaInventario(libroId);
  if (!hoja) {
    // Hoja aún no existe — todavía no se ha agregado ningún producto.
    return [];
  }
  const filasTotales = await leerRango(libroId, `'${hoja}'!A1:Z`);
  if (filasTotales.length < 2) return [];

  const { headers, dataRows, headerRowIndex } = detectarHeaderRow(filasTotales);
  const cols = mapearColumnasInventario(headers);
  if (cols.marca === -1 || cols.equipo === -1 || cols.imei1 === -1) {
    throw new Error(
      `Faltan columnas críticas. Encontré: ${JSON.stringify(cols)}. Headers: ${headers.join(" | ")}`
    );
  }

  const fMarca = filtro?.marca ? normalizar(filtro.marca) : "";
  const fEquipo = filtro?.equipo ? normalizar(filtro.equipo) : "";
  const fColor = filtro?.color ? normalizar(filtro.color) : "";

  const productos: Producto[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const fila = dataRows[i] || [];
    // Filtro 1: regla de 2026+ (ignorar data histórica sucia)
    if (!esDe2026OPosterior(fila, cols)) continue;
    // Filtro 2: solo disponibles (no vendidos)
    if (!estaDisponible(fila, cols)) continue;
    // +2 porque headerRowIndex es 0-indexed, Sheets es 1-indexed, y sumamos
    // 1 más porque i es offset desde la fila de datos (no del header)
    const filaNumero = headerRowIndex + i + 2;
    const p = filaAProducto(fila, cols, filaNumero);
    if (!p.imei || !p.equipo) continue; // filas vacías

    if (fMarca && normalizar(p.marca) !== fMarca) continue;
    if (fEquipo && normalizar(p.equipo) !== fEquipo) continue;
    if (fColor && !normalizar(p.color).includes(fColor)) continue;

    productos.push(p);
  }
  return productos;
}

/**
 * Busca un producto por IMEI (exacto, 15 dígitos). Revisa IMEI 1 e IMEI 2.
 * Retorna el producto AUNQUE ya esté vendido, pero incluye la bandera
 * `disponible: false` + la fecha de venta. Es responsabilidad del API/UI
 * bloquear la selección si no está disponible.
 */
export async function buscarPorImei(
  libroId: string,
  imei: string
): Promise<(Producto & { disponible: boolean; fechaVenta?: string }) | null> {
  const hoja = await hojaInventario(libroId);
  if (!hoja) return null;
  const filasTotales = await leerRango(libroId, `'${hoja}'!A1:Z`);
  if (filasTotales.length < 2) return null;

  const { headers, dataRows, headerRowIndex } = detectarHeaderRow(filasTotales);
  const cols = mapearColumnasInventario(headers);
  if (cols.imei1 === -1) {
    throw new Error(
      `No encontré columna IMEI. Headers: ${headers.join(" | ")}`
    );
  }

  const imeiLimpio = String(imei).replace(/\D/g, "");
  for (let i = 0; i < dataRows.length; i++) {
    const fila = dataRows[i] || [];
    // Filtro 2026+ — si el equipo es histórico sucio, lo tratamos como
    // no existente para no meternos en líos con datos desordenados.
    if (!esDe2026OPosterior(fila, cols)) continue;
    const imei1 =
      cols.imei1 >= 0 ? String(fila[cols.imei1] || "").replace(/\D/g, "") : "";
    const imei2 =
      cols.imei2 >= 0 ? String(fila[cols.imei2] || "").replace(/\D/g, "") : "";
    if (imei1 === imeiLimpio || imei2 === imeiLimpio) {
      const filaNumero = headerRowIndex + i + 2;
      const disponible = estaDisponible(fila, cols);
      const fechaVenta =
        cols.fechaVenta >= 0
          ? String(fila[cols.fechaVenta] || "")
          : undefined;
      return {
        ...filaAProducto(fila, cols, filaNumero),
        disponible,
        fechaVenta: fechaVenta || undefined,
      };
    }
  }
  return null;
}

/**
 * Crea un producto nuevo en el inventario.
 * Valida que el IMEI no exista ya (ni como IMEI 1 ni como IMEI 2 en otros equipos).
 * Lanza error si hay duplicado.
 */
export async function crearProducto(
  libroId: string,
  datos: {
    marca: string;
    equipo: string;
    color?: string;
    imei1: string;
    imei2?: string;
    precioCosto?: number;
    proveedor?: string;
    fechaIngreso?: string; // si no viene, usa hoy
  }
): Promise<{ filaEscrita: number }> {
  // Crea la hoja automáticamente si es la primera vez
  const hoja = await asegurarHojaInventario(libroId);
  const filasTotales = await leerRango(libroId, `'${hoja}'!A1:Z`);
  const { headers, dataRows } = detectarHeaderRow(filasTotales);
  const cols = mapearColumnasInventario(headers);

  // Validar IMEIs (15 dígitos)
  const imei1 = String(datos.imei1).replace(/\D/g, "");
  if (imei1.length !== 15) {
    throw new Error(`IMEI 1 debe ser 15 dígitos (tiene ${imei1.length})`);
  }
  const imei2 = datos.imei2 ? String(datos.imei2).replace(/\D/g, "") : "";
  if (imei2 && imei2.length !== 15) {
    throw new Error(`IMEI 2 debe ser 15 dígitos (tiene ${imei2.length})`);
  }

  // Validar UNICIDAD — revisa TODOS los registros 2026+ (vendidos incluidos).
  // Los pre-2026 los ignoramos porque son históricos sucios según Leonardo.
  for (const fila of dataRows) {
    if (!esDe2026OPosterior(fila, cols)) continue;
    const exist1 =
      cols.imei1 >= 0 ? String(fila[cols.imei1] || "").replace(/\D/g, "") : "";
    const exist2 =
      cols.imei2 >= 0 ? String(fila[cols.imei2] || "").replace(/\D/g, "") : "";
    if (exist1 === imei1 || exist2 === imei1) {
      throw new Error(`El IMEI ${imei1} ya existe en el inventario`);
    }
    if (imei2 && (exist1 === imei2 || exist2 === imei2)) {
      throw new Error(`El IMEI ${imei2} ya existe en el inventario`);
    }
  }

  // Construir la fila respetando el orden real de columnas
  const fila: any[] = new Array(headers.length).fill("");
  const hoy = datos.fechaIngreso || new Date().toISOString().slice(0, 10);
  if (cols.fechaIngreso >= 0) fila[cols.fechaIngreso] = hoy;
  if (cols.marca >= 0) fila[cols.marca] = datos.marca.trim();
  if (cols.equipo >= 0) fila[cols.equipo] = datos.equipo.trim();
  if (cols.imei1 >= 0) fila[cols.imei1] = imei1;
  if (cols.imei2 >= 0 && imei2) fila[cols.imei2] = imei2;
  if (cols.color >= 0 && datos.color) fila[cols.color] = datos.color.trim();
  if (cols.precioCosto >= 0 && datos.precioCosto !== undefined)
    fila[cols.precioCosto] = datos.precioCosto;
  if (cols.proveedor >= 0 && datos.proveedor)
    fila[cols.proveedor] = datos.proveedor.trim();
  if (cols.estado >= 0) fila[cols.estado] = "DISPONIBLE";

  return agregarFila(libroId, hoja, fila);
}

/**
 * Devuelve listas únicas de marcas, equipos y colores a partir de los
 * productos disponibles. Deduplicación robusta por clave normalizada
 * (trim + uppercase + sin acentos) para evitar mostrar "Samsung" y
 * "Samsung " como opciones distintas en el dropdown.
 */
export function extraerOpciones(productos: Producto[]): {
  marcas: string[];
  equiposPorMarca: Record<string, string[]>;
  colores: string[];
} {
  // Map<keyNormalizada, valorDisplay>
  const marcasMap = new Map<string, string>();
  // Map<marcaNormalizada, Map<equipoNorm, equipoDisplay>>
  const equiposMap = new Map<string, Map<string, string>>();
  const coloresMap = new Map<string, string>();

  for (const p of productos) {
    const marcaTrim = (p.marca || "").trim();
    if (marcaTrim) {
      const k = normalizar(marcaTrim);
      if (!marcasMap.has(k)) marcasMap.set(k, marcaTrim);
    }
    const equipoTrim = (p.equipo || "").trim();
    if (marcaTrim && equipoTrim) {
      const km = normalizar(marcaTrim);
      if (!equiposMap.has(km)) equiposMap.set(km, new Map());
      const ke = normalizar(equipoTrim);
      if (!equiposMap.get(km)!.has(ke)) {
        equiposMap.get(km)!.set(ke, equipoTrim);
      }
    }
    const colorTrim = (p.color || "").trim();
    if (colorTrim) {
      const k = normalizar(colorTrim);
      if (!coloresMap.has(k)) coloresMap.set(k, colorTrim);
    }
  }

  // Reindexar equiposPorMarca por el display name de la marca (no por normalizado)
  const equiposPorMarca: Record<string, string[]> = {};
  for (const [normKey, equipos] of equiposMap) {
    const marcaDisplay = marcasMap.get(normKey) || normKey;
    equiposPorMarca[marcaDisplay] = [...equipos.values()].sort();
  }

  return {
    marcas: [...marcasMap.values()].sort(),
    equiposPorMarca,
    colores: [...coloresMap.values()].sort(),
  };
}

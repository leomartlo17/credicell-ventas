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
import { leerRango, listarHojas, agregarFila } from "@/lib/google-sheets";

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
 * Localiza la hoja de inventario android. Nombre exacto puede variar entre sedes.
 */
export async function hojaInventario(libroId: string): Promise<string> {
  const hojas = await listarHojas(libroId);
  // Preferencia: hoja que contenga ANDROID
  let match = hojas.find(
    (h) => h.toUpperCase().includes("INVENTARIO") && h.toUpperCase().includes("ANDROID")
  );
  if (!match) {
    match = hojas.find((h) => h.toUpperCase().includes("INVENTARIO"));
  }
  if (!match) {
    throw new Error(
      `No encontré hoja de inventario. Hojas disponibles: ${hojas.join(", ")}`
    );
  }
  return match;
}

/**
 * Detecta la fila de headers escaneando las primeras 10 filas y eligiendo la
 * que tiene al menos 2 columnas reconocibles (MARCA, EQUIPO o IMEI). Útil
 * cuando la hoja tiene un título en la fila 1 y los headers reales están
 * en la fila 2, 3 o 4.
 *
 * Retorna { headerRowIndex, headers, dataRows } con los datos posteriores
 * al header. headerRowIndex es 0-indexed dentro de filasTotales.
 */
function detectarHeaderRow(filasTotales: any[][]): {
  headerRowIndex: number;
  headers: string[];
  dataRows: any[][];
} {
  const maxScan = Math.min(10, filasTotales.length);
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
          .slice(0, Math.min(4, filasTotales.length))
          .map((r) => (r || []).join("|"))
          .join(" // ")}`
    );
  }
  return {
    headerRowIndex: mejorIndex,
    headers: (filasTotales[mejorIndex] || []).map((x) => String(x)),
    dataRows: filasTotales.slice(mejorIndex + 1),
  };
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
  // DISPONIBLE = FECHA VENTA vacía. Ignoramos la columna ESTADO porque
  // a veces queda desactualizada; la fecha de venta es la verdad.
  if (cols.fechaVenta < 0) return true; // sin columna, asumimos disponible
  const fv = fila[cols.fechaVenta];
  if (fv === "" || fv === undefined || fv === null) return true;
  return false;
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
 * Retorna el producto AUNQUE ya esté vendido — es responsabilidad del caller
 * avisar al usuario si el producto no está disponible.
 */
export async function buscarPorImei(
  libroId: string,
  imei: string
): Promise<Producto | null> {
  const hoja = await hojaInventario(libroId);
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
    const imei1 =
      cols.imei1 >= 0 ? String(fila[cols.imei1] || "").replace(/\D/g, "") : "";
    const imei2 =
      cols.imei2 >= 0 ? String(fila[cols.imei2] || "").replace(/\D/g, "") : "";
    if (imei1 === imeiLimpio || imei2 === imeiLimpio) {
      const filaNumero = headerRowIndex + i + 2;
      return filaAProducto(fila, cols, filaNumero);
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
  const hoja = await hojaInventario(libroId);
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

  // Validar UNICIDAD — revisa todas las filas (vendidas e inactivas también)
  for (const fila of dataRows) {
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
 * Devuelve listas únicas de marcas, equipos (agrupados por marca) y colores
 * a partir de los productos disponibles. Útil para poblar dropdowns.
 */
export function extraerOpciones(productos: Producto[]): {
  marcas: string[];
  equiposPorMarca: Record<string, string[]>;
  colores: string[];
} {
  const marcasSet = new Set<string>();
  const equiposMap = new Map<string, Set<string>>();
  const coloresSet = new Set<string>();
  for (const p of productos) {
    if (p.marca) marcasSet.add(p.marca);
    if (p.marca && p.equipo) {
      if (!equiposMap.has(p.marca)) equiposMap.set(p.marca, new Set());
      equiposMap.get(p.marca)!.add(p.equipo);
    }
    if (p.color) coloresSet.add(p.color);
  }
  const equiposPorMarca: Record<string, string[]> = {};
  for (const [m, s] of equiposMap) equiposPorMarca[m] = [...s].sort();
  return {
    marcas: [...marcasSet].sort(),
    equiposPorMarca,
    colores: [...coloresSet].sort(),
  };
}

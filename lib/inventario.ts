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
import { leerRango, listarHojas } from "@/lib/google-sheets";

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
  const filas = await leerRango(libroId, `'${hoja}'!A1:Z`);
  if (filas.length < 2) return [];

  const headers = (filas[0] || []).map((x) => String(x));
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
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    if (!estaDisponible(fila, cols)) continue;
    const p = filaAProducto(fila, cols, i + 1);
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
  const filas = await leerRango(libroId, `'${hoja}'!A1:Z`);
  if (filas.length < 2) return null;

  const headers = (filas[0] || []).map((x) => String(x));
  const cols = mapearColumnasInventario(headers);
  if (cols.imei1 === -1) {
    throw new Error(
      `No encontré columna IMEI. Headers: ${headers.join(" | ")}`
    );
  }

  const imeiLimpio = String(imei).replace(/\D/g, "");
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const imei1 =
      cols.imei1 >= 0 ? String(fila[cols.imei1] || "").replace(/\D/g, "") : "";
    const imei2 =
      cols.imei2 >= 0 ? String(fila[cols.imei2] || "").replace(/\D/g, "") : "";
    if (imei1 === imeiLimpio || imei2 === imeiLimpio) {
      return filaAProducto(fila, cols, i + 1);
    }
  }
  return null;
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

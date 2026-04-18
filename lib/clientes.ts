/**
 * Helper de clientes — busca y crea registros en la hoja CLIENTES ESTUDIO
 * de cada sede. Tolera variaciones en los nombres de columnas:
 * busca la columna "CÉDULA" por nombre (case-insensitive, sin acentos)
 * y extrae los campos conocidos por coincidencia de keyword.
 *
 * Columnas conocidas (todas opcionales excepto cedula y nombre):
 *   - cedula:     "CEDULA" | "CC" | "DOCUMENTO" | "IDENTIFICACION"
 *   - nombre:     "NOMBRE" | "NOMBRE COMPLETO" | "CLIENTE"
 *   - telefono:   "TELEFONO" | "CELULAR" | "CONTACTO"
 *   - direccion:  "DIRECCION"
 *   - ciudad:     "CIUDAD"
 *   - email:      "EMAIL" | "CORREO"
 *   - fechaNacimiento: "FECHA NACIMIENTO" | "NACIMIENTO" | "F. NACIMIENTO"
 *   - ocupacion:  "OCUPACION" | "TRABAJO" | "PROFESION"
 */
import { leerRango, agregarFila, listarHojas } from "@/lib/google-sheets";

export type Cliente = {
  cedula: string;
  nombre: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  email?: string;
  fechaNacimiento?: string;
  ocupacion?: string;
  /** Fila en la hoja donde está el registro, para updates futuros. -1 si es nuevo. */
  fila?: number;
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

/**
 * Dado el array de headers, devuelve un mapa de { campo -> indiceColumna }.
 * Devuelve -1 para campos no encontrados.
 */
export type ColMap = {
  cedula: number;
  nombre: number;
  telefono: number;
  direccion: number;
  ciudad: number;
  email: number;
  fechaNacimiento: number;
  ocupacion: number;
};

export function mapearColumnas(headers: string[]): ColMap {
  const h = headers.map((x) => normalizar(x));
  const find = (keywords: string[]): number => {
    for (let i = 0; i < h.length; i++) {
      for (const kw of keywords) {
        if (h[i].includes(kw)) return i;
      }
    }
    return -1;
  };
  return {
    cedula: find(["CEDULA", "DOCUMENTO", "IDENTIFICACION", "CC "]),
    nombre: find(["NOMBRE", "CLIENTE"]),
    telefono: find(["TELEFONO", "CELULAR", "CONTACTO", "TEL"]),
    direccion: find(["DIRECCION"]),
    ciudad: find(["CIUDAD", "MUNICIPIO"]),
    email: find(["EMAIL", "CORREO"]),
    fechaNacimiento: find(["NACIMIENTO"]),
    ocupacion: find(["OCUPACION", "PROFESION", "TRABAJO", "EMPLEO"]),
  };
}

/**
 * Localiza la hoja de clientes (nombre exacto puede variar entre sedes).
 */
export async function hojaClientes(libroId: string): Promise<string> {
  const hojas = await listarHojas(libroId);
  const match = hojas.find((h) => h.toUpperCase().includes("CLIENTE"));
  if (!match) {
    throw new Error(
      `No encontré hoja de clientes en el libro. Hojas disponibles: ${hojas.join(", ")}`
    );
  }
  return match;
}

/**
 * Busca un cliente por cédula. Retorna null si no existe.
 * Hace una sola lectura del rango A1:Z y filtra en memoria — para volúmenes
 * de <10k clientes esto es más rápido que una query API y es más resiliente.
 */
export async function buscarPorCedula(
  libroId: string,
  cedula: string
): Promise<Cliente | null> {
  const hoja = await hojaClientes(libroId);
  const filas = await leerRango(libroId, `'${hoja}'!A1:Z`);
  if (filas.length < 2) return null;

  const headers = (filas[0] || []).map((x) => String(x));
  const cols = mapearColumnas(headers);
  if (cols.cedula === -1) {
    throw new Error(
      `No encontré columna de cédula. Headers: ${headers.join(" | ")}`
    );
  }
  if (cols.nombre === -1) {
    throw new Error(
      `No encontré columna de nombre. Headers: ${headers.join(" | ")}`
    );
  }

  const cedulaBuscada = String(cedula).replace(/\D/g, "");
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const cedulaFila = String(fila[cols.cedula] || "").replace(/\D/g, "");
    if (cedulaFila && cedulaFila === cedulaBuscada) {
      return {
        cedula: cedulaFila,
        nombre: String(fila[cols.nombre] || ""),
        telefono: cols.telefono >= 0 ? String(fila[cols.telefono] || "") : undefined,
        direccion: cols.direccion >= 0 ? String(fila[cols.direccion] || "") : undefined,
        ciudad: cols.ciudad >= 0 ? String(fila[cols.ciudad] || "") : undefined,
        email: cols.email >= 0 ? String(fila[cols.email] || "") : undefined,
        fechaNacimiento:
          cols.fechaNacimiento >= 0 ? String(fila[cols.fechaNacimiento] || "") : undefined,
        ocupacion: cols.ocupacion >= 0 ? String(fila[cols.ocupacion] || "") : undefined,
        fila: i + 1, // +1 porque Sheets es 1-indexed
      };
    }
  }
  return null;
}

/**
 * Crea un cliente nuevo en CLIENTES ESTUDIO respetando el orden de columnas
 * existente. Los campos que no tengamos se dejan vacíos.
 */
export async function crearCliente(
  libroId: string,
  datos: Cliente
): Promise<{ filaEscrita: number }> {
  const hoja = await hojaClientes(libroId);
  const headerRow = await leerRango(libroId, `'${hoja}'!A1:Z1`);
  const headers = (headerRow[0] || []).map((x) => String(x));
  const cols = mapearColumnas(headers);

  // Construir fila respetando la posición de cada columna
  const fila: any[] = new Array(headers.length).fill("");
  if (cols.cedula >= 0) fila[cols.cedula] = datos.cedula;
  if (cols.nombre >= 0) fila[cols.nombre] = datos.nombre;
  if (cols.telefono >= 0 && datos.telefono) fila[cols.telefono] = datos.telefono;
  if (cols.direccion >= 0 && datos.direccion) fila[cols.direccion] = datos.direccion;
  if (cols.ciudad >= 0 && datos.ciudad) fila[cols.ciudad] = datos.ciudad;
  if (cols.email >= 0 && datos.email) fila[cols.email] = datos.email;
  if (cols.fechaNacimiento >= 0 && datos.fechaNacimiento)
    fila[cols.fechaNacimiento] = datos.fechaNacimiento;
  if (cols.ocupacion >= 0 && datos.ocupacion) fila[cols.ocupacion] = datos.ocupacion;

  return agregarFila(libroId, hoja, fila);
}

/**
 * Helper de Google Sheets API.
 * Usa una Service Account para autenticarse sin interacción del usuario.
 * El email de la Service Account debe estar agregado como editor en cada libro.
 */
import { google, sheets_v4 } from "googleapis";

let _client: sheets_v4.Sheets | null = null;

export function getSheetsClient(): sheets_v4.Sheets {
  if (_client) return _client;

  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Faltan credenciales: GOOGLE_SHEETS_CLIENT_EMAIL y/o GOOGLE_SHEETS_PRIVATE_KEY"
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  _client = google.sheets({ version: "v4", auth });
  return _client;
}

/**
 * Lee un rango completo de una hoja.
 * Ej: leerRango(libroId, "CLIENTES ESTUDIO!A2:L")
 */
export async function leerRango(
  spreadsheetId: string,
  range: string
): Promise<any[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING"
  });
  return res.data.values || [];
}

/**
 * Agrega una fila al final de una hoja.
 */
export async function agregarFila(
  spreadsheetId: string,
  hoja: string,
  valores: any[]
): Promise<{ filaEscrita: number }> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${hoja}!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [valores] }
  });
  const updatedRange = res.data.updates?.updatedRange || "";
  const match = updatedRange.match(/!A(\d+):/);
  return { filaEscrita: match ? parseInt(match[1], 10) : -1 };
}

/**
 * Actualiza celdas específicas (ej: marcar IMEI como vendido).
 */
export async function actualizarCelda(
  spreadsheetId: string,
  rangoA1: string,
  valor: any
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: rangoA1,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[valor]] }
  });
}

/**
 * Obtiene la lista de hojas (pestañas) de un libro — útil para diagnóstico.
 */
export async function listarHojas(spreadsheetId: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.sheets?.map((s) => s.properties?.title || "") || [];
}

/**
 * Crea una pestaña nueva en el libro. Si ya existe, no hace nada y retorna
 * false (para que el caller sepa que no tuvo que crearla).
 */
export async function crearHoja(
  spreadsheetId: string,
  titulo: string
): Promise<boolean> {
  const sheets = getSheetsClient();
  const existentes = await listarHojas(spreadsheetId);
  if (existentes.includes(titulo)) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title: titulo },
          },
        },
      ],
    },
  });
  return true;
}

/**
 * Borra una pestaña (por título) del libro. Si no existe, no hace nada.
 * IRREVERSIBLE — se pierden todos los datos de esa pestaña.
 * Retorna true si la borró, false si no existía.
 */
export async function eliminarHoja(
  spreadsheetId: string,
  titulo: string
): Promise<boolean> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const hoja = res.data.sheets?.find((s) => s.properties?.title === titulo);
  if (!hoja || !hoja.properties?.sheetId) return false;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteSheet: {
            sheetId: hoja.properties.sheetId,
          },
        },
      ],
    },
  });
  return true;
}

/**
 * Escribe valores empezando en una celda (sobrescribiendo). Útil para
 * escribir el row de headers después de crear una hoja nueva.
 */
export async function escribirRango(
  spreadsheetId: string,
  rangoA1: string,
  filas: any[][]
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: rangoA1,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: filas },
  });
}

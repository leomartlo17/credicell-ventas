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

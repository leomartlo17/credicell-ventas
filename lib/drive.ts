/**
 * Helper de Google Drive API. Sube archivos a una carpeta compartida con
 * el Service Account. El ID de la carpeta viene de env var por sede.
 *
 * Setup requerido por el admin (una vez):
 *   1. Crear carpeta en Drive propio (ej: "Facturas CREDICELL").
 *   2. Compartirla con credicell-sheets@credicell-ventas.iam.gserviceaccount.com
 *      como Editor.
 *   3. Copiar el ID de la carpeta (de la URL: /folders/<ID>).
 *   4. Agregar en Vercel env var DRIVE_FOLDER_FACTURAS_SAN_ESTEBAN.
 *   5. Redeploy.
 */
import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";

let _client: drive_v3.Drive | null = null;

export function getDriveClient(): drive_v3.Drive {
  if (_client) return _client;
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error(
      "Faltan credenciales Google (GOOGLE_SHEETS_CLIENT_EMAIL / PRIVATE_KEY)"
    );
  }
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  _client = google.drive({ version: "v3", auth });
  return _client;
}

/**
 * Retorna el ID de la carpeta de Drive configurada para guardar facturas
 * de la sede indicada. Por sede, por ahora solo San Esteban. Retorna null
 * si no está configurada.
 */
export function getFolderIdParaSede(sedeId: string): string | null {
  if (sedeId === "san-esteban") {
    return process.env.DRIVE_FOLDER_FACTURAS_SAN_ESTEBAN || null;
  }
  return null;
}

/**
 * Sube un archivo a Drive. Permisos: cualquier persona con el link puede
 * ver (así la URL pegada en la hoja Caja 2026 es clickeable por cualquier
 * contador sin pedir permisos).
 */
export async function subirArchivo(
  folderId: string,
  nombreArchivo: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ id: string; webViewLink: string }> {
  const drive = getDriveClient();
  const stream = Readable.from(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: nombreArchivo,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });

  const id = res.data.id;
  if (!id) throw new Error("Drive no devolvió ID del archivo");

  // Hacer visible con link (anyone with link → viewer)
  await drive.permissions.create({
    fileId: id,
    requestBody: {
      type: "anyone",
      role: "reader",
    },
    supportsAllDrives: true,
  });

  const webViewLink = res.data.webViewLink || `https://drive.google.com/file/d/${id}/view`;
  return { id, webViewLink };
}

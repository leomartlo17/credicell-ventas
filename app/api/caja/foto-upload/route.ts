import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { getFolderIdParaSede, subirArchivo } from "@/lib/drive";
import { NextResponse } from "next/server";

/**
 * GET /api/caja/foto-upload
 * Responde { disponible: true/false } según si la carpeta Drive está
 * configurada para la sede del usuario. La UI usa esto para mostrar
 * upload de archivo vs. input de URL manual.
 */
export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ disponible: false });
  }
  const sede = session.sede;
  if (!sede) return NextResponse.json({ disponible: false });
  const folderId = getFolderIdParaSede(sede.id);
  return NextResponse.json({ disponible: Boolean(folderId) });
}

/**
 * POST /api/caja/foto-upload
 * Multipart con campo "archivo" (imagen o PDF) y opcionalmente
 * "referencia". Sube a la carpeta Drive configurada para la sede,
 * hace el archivo visible con link, y devuelve la URL.
 */
export async function POST(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede" }, { status: 403 });
  }

  const folderId = getFolderIdParaSede(sede.id);
  if (!folderId) {
    return NextResponse.json(
      {
        error:
          "Upload de fotos no está configurado para esta sede. El admin debe " +
          "crear una carpeta en Drive, compartirla con la service account, y " +
          "agregar el ID en la env var DRIVE_FOLDER_FACTURAS_<SEDE>.",
      },
      { status: 501 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Formato inválido (se espera multipart/form-data)" },
      { status: 400 }
    );
  }

  const archivo = formData.get("archivo");
  if (!archivo || !(archivo instanceof File)) {
    return NextResponse.json(
      { error: "Falta el archivo (campo 'archivo')" },
      { status: 400 }
    );
  }
  // Límite de tamaño: 10 MB
  if (archivo.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Archivo muy grande (máx 10 MB)" },
      { status: 400 }
    );
  }
  const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
  if (!tiposPermitidos.includes(archivo.type)) {
    return NextResponse.json(
      { error: `Tipo no soportado: ${archivo.type}. Usa JPG, PNG, WEBP, HEIC o PDF.` },
      { status: 400 }
    );
  }

  const referencia = String(formData.get("referencia") || "").trim();
  const asesor = session.user.name || session.user.email || "asesor";
  const fechaHora = new Date().toISOString().replace(/[:.]/g, "-");

  // Nombre útil: FECHA__REFERENCIA__ASESOR__nombre-original
  const refSanit = referencia
    .replace(/[^\w\d-]/g, "_")
    .slice(0, 30);
  const nombreFinal = [
    fechaHora,
    refSanit || "sin-ref",
    (asesor.split(" ")[0] || "asesor").replace(/[^\w]/g, ""),
    archivo.name.replace(/[^\w\d.-]/g, "_").slice(-40),
  ].join("__");

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const { id, webViewLink } = await subirArchivo(
      folderId,
      nombreFinal,
      archivo.type,
      buffer
    );
    return NextResponse.json({ ok: true, id, url: webViewLink });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e?.message ||
          "Error subiendo a Drive. Revisa que la carpeta esté compartida con la service account como Editor.",
      },
      { status: 500 }
    );
  }
}

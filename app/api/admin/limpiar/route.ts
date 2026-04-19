import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { listarHojas, eliminarHoja } from "@/lib/google-sheets";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Lista de pestañas que NUNCA se pueden borrar desde el admin. Son las
 * que el sistema usa activamente o que tienen el prefijo "CLIENTES"
 * (datos sensibles de clientes de estudio).
 */
const HOJAS_PROTEGIDAS_EXACTAS = [
  "Inventario android 2026",
  "Ventas 2026",
  "KREDIYA 2026",
  "PAYJOY 2026",
  "Caja 2026",
];

function esProtegida(nombre: string): boolean {
  const n = nombre.trim();
  if (HOJAS_PROTEGIDAS_EXACTAS.includes(n)) return true;
  const nUpper = n.toUpperCase();
  // Pestañas de clientes → no borrar
  if (nUpper.includes("CLIENTE")) return true;
  return false;
}

/**
 * GET /api/admin/limpiar
 * Lista todas las pestañas del libro con marca de cuáles son protegidas
 * (no se pueden borrar) y cuáles son candidatas a eliminar.
 */
export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!session.esAdmin) {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede" }, { status: 403 });
  }

  try {
    const hojas = await listarHojas(sede.libroId);
    const resultado = hojas.map((h) => ({
      nombre: h,
      protegida: esProtegida(h),
    }));
    return NextResponse.json({
      libroId: sede.libroId,
      hojas: resultado,
      totalHojas: hojas.length,
      protegidas: resultado.filter((h) => h.protegida).length,
      eliminables: resultado.filter((h) => !h.protegida).length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error" },
      { status: 500 }
    );
  }
}

const schema = z.object({
  pestanasAEliminar: z.array(z.string()).min(1),
  confirmacion: z.literal("BORRAR"),
});

/**
 * POST /api/admin/limpiar
 * Recibe una lista de pestañas a eliminar + confirmación explícita "BORRAR".
 * Rechaza cualquier pestaña protegida (no se puede borrar por UI).
 */
export async function POST(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!session.esAdmin) {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Para borrar tienes que enviar confirmacion: 'BORRAR' y al menos una pestaña en pestanasAEliminar",
      },
      { status: 400 }
    );
  }

  const { pestanasAEliminar } = parsed.data;

  // Verificar que ninguna sea protegida
  const protegidasEnSolicitud = pestanasAEliminar.filter((p) => esProtegida(p));
  if (protegidasEnSolicitud.length > 0) {
    return NextResponse.json(
      {
        error: `No se pueden borrar pestañas protegidas: ${protegidasEnSolicitud.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const resultados: Array<{ pestana: string; borrada: boolean; error?: string }> = [];
  for (const p of pestanasAEliminar) {
    try {
      const borrada = await eliminarHoja(sede.libroId, p);
      resultados.push({ pestana: p, borrada });
    } catch (e: any) {
      resultados.push({
        pestana: p,
        borrada: false,
        error: e?.message || "Error desconocido",
      });
    }
  }

  const exitos = resultados.filter((r) => r.borrada).length;
  const fallidas = resultados.filter((r) => !r.borrada);
  return NextResponse.json({
    ok: true,
    borradas: exitos,
    totalSolicitadas: pestanasAEliminar.length,
    resultados,
    ...(fallidas.length > 0
      ? { advertencia: `${fallidas.length} pestañas no se borraron (ver resultados)` }
      : {}),
  });
}

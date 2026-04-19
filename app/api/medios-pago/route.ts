/**
 * API del catálogo MEDIOS_PAGO.
 *
 * GET  — lista los medios activos (público para usuarios autenticados
 *        con sede — el Paso 3 necesita esta lista para pintar inputs).
 *
 * POST — crea un medio nuevo. Solo admins. La regla es: admin es la
 *        persona que puede autorizar cambios estructurales (Leonardo hoy,
 *        los administrativos cuando se agreguen). Los asesores normales
 *        NO pueden crear medios — eso ensuciaría el catálogo.
 *
 * PATCH — activa o desactiva un medio existente (soft toggle). Solo admins.
 *         Nunca se borran filas — regla "nada se pierde".
 */
import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import {
  listarMedios,
  listarMediosActivos,
  crearMedio,
  cambiarEstadoMedio,
} from "@/lib/medios-pago";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede" }, { status: 403 });
  }

  // ?incluirInactivos=1 — usado por la UI admin para mostrar todos
  const url = new URL(req.url);
  const incluirInactivos = url.searchParams.get("incluirInactivos") === "1";
  const creador = session.user.name || session.user.email || "sistema";

  try {
    const medios = incluirInactivos
      ? await listarMedios(sede.libroId, creador)
      : await listarMediosActivos(sede.libroId, creador);
    return NextResponse.json({ medios });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Error al leer medios" },
      { status: 500 }
    );
  }
}

const crearSchema = z.object({
  nombre: z.string().min(2).max(30),
  observaciones: z.string().optional(),
});

export async function POST(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!session.esAdmin) {
    return NextResponse.json(
      { error: "Solo admins pueden crear medios de pago" },
      { status: 403 }
    );
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
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 }
    );
  }

  const creador = session.user.name || session.user.email || "sistema";
  try {
    const medio = await crearMedio(
      sede.libroId,
      parsed.data.nombre,
      creador,
      parsed.data.observaciones
    );
    return NextResponse.json({ ok: true, medio });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error al crear medio" },
      { status: 400 }
    );
  }
}

const patchSchema = z.object({
  nombre: z.string().min(2).max(30),
  activar: z.boolean(),
});

export async function PATCH(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!session.esAdmin) {
    return NextResponse.json(
      { error: "Solo admins pueden modificar medios de pago" },
      { status: 403 }
    );
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 }
    );
  }

  const creador = session.user.name || session.user.email || "sistema";
  try {
    await cambiarEstadoMedio(
      sede.libroId,
      parsed.data.nombre,
      parsed.data.activar,
      creador
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error al cambiar estado" },
      { status: 400 }
    );
  }
}

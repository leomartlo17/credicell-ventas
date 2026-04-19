import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { anularMovimiento } from "@/lib/caja";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * POST /api/caja/anular
 * Anula un movimiento de caja creando una fila nueva tipo ANULACION.
 * Regla Leonardo: nada se borra. El movimiento original queda en la hoja
 * marcado con ANULADO EN FILA = fila de la anulación. El saldo se
 * recalcula automáticamente ignorando pares original+anulación.
 *
 * Solo admins pueden anular — es una operación sensible que corrige un
 * error de digitación o un cargo duplicado. No es un flujo de devolución.
 */
const schema = z.object({
  fila: z.number().int().positive(),
  motivo: z.string().min(3, "Escribe el motivo (mínimo 3 caracteres)"),
});

export async function POST(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!session.esAdmin) {
    return NextResponse.json(
      { error: "Solo admins pueden anular movimientos de caja" },
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 }
    );
  }

  const asesor = session.user.name || session.user.email || "admin";
  try {
    const res = await anularMovimiento(
      sede.libroId,
      parsed.data.fila,
      parsed.data.motivo,
      asesor
    );
    return NextResponse.json({ ok: true, ...res });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error al anular" },
      { status: 400 }
    );
  }
}

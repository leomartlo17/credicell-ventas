import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { registrarMovimiento } from "@/lib/caja";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  concepto: z.string().min(1, "Concepto requerido"),
  establecimiento: z.string().optional(),
  monto: z.number().positive(),
  referencia: z.string().optional(),
  urlFactura: z.string().optional(),
  prestamoOtraSede: z.boolean().optional(),
  observaciones: z.string().optional(),
  autorizadoPor: z.string().optional(),
});

/**
 * POST /api/caja/egreso
 * Registra un gasto de efectivo de la caja de la sede. El saldo se
 * recalcula automáticamente y queda reflejado en la hoja Caja 2026.
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
  const d = parsed.data;
  const asesor = session.user.name || session.user.email || "desconocido";

  try {
    const { filaEscrita, saldoDespues } = await registrarMovimiento(
      sede.libroId,
      {
        tipo: "EGRESO",
        concepto: d.concepto,
        establecimiento: d.establecimiento,
        monto: d.monto,
        asesor,
        referencia: d.referencia,
        urlFactura: d.urlFactura,
        prestamoOtraSede: d.prestamoOtraSede,
        observaciones: d.observaciones,
        autorizadoPor: d.autorizadoPor,
      }
    );
    return NextResponse.json({ ok: true, filaEscrita, saldoDespues });
  } catch (error: any) {
    const msg = error?.message || "Error al registrar egreso";
    // Validaciones de negocio (factura obligatoria, autorización) son
    // errores del usuario, no del servidor — responder 400 para que el
    // frontend muestre el mensaje legible.
    const esValidacion =
      msg.includes("obligatoria") || msg.includes("Autorización");
    return NextResponse.json(
      { ok: false, error: msg },
      { status: esValidacion ? 400 : 500 }
    );
  }
}

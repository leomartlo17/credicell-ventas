import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { leerRango, listarHojas } from "@/lib/google-sheets";
import { NextResponse } from "next/server";

/**
 * Diagnóstico del inventario — muestra las hojas disponibles y las primeras
 * filas de la primera hoja que contiene "INVENTARIO".
 */
export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json({ error: "Sin sede asignada" }, { status: 403 });
  }

  try {
    const hojas = await listarHojas(sede.libroId);
    const candidatos = hojas.filter((h) => h.toUpperCase().includes("INVENTARIO"));
    if (candidatos.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "No hay hojas de inventario",
        hojasDisponibles: hojas,
      });
    }

    const resultados: any = {};
    for (const hoja of candidatos) {
      const filas = await leerRango(sede.libroId, `'${hoja}'!A1:Z6`);
      resultados[hoja] = {
        headers: filas[0] || [],
        muestra: filas.slice(1),
      };
    }

    return NextResponse.json({
      ok: true,
      sede: sede.nombre,
      libroId: sede.libroId,
      hojasDisponibles: hojas,
      hojasInventario: candidatos,
      datos: resultados,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error" },
      { status: 500 }
    );
  }
}

import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { leerRango, listarHojas } from "@/lib/google-sheets";
import { listarDisponibles } from "@/lib/inventario";
import { NextResponse } from "next/server";

/**
 * Diagnóstico detallado del inventario — para que Leonardo me mande la
 * salida y yo pueda ver exactamente qué hay en la hoja.
 *
 * Retorna:
 *   - Todas las hojas del libro
 *   - Las hojas que incluyen "INVENTARIO" en el nombre
 *   - Las primeras 30 filas crudas de cada una
 *   - Conteo de productos disponibles detectados (2026+)
 *   - Muestra de los primeros 5 disponibles
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

  const resultado: any = {
    sede: sede.nombre,
    libroId: sede.libroId,
    reglas: {
      anioMinimo: 2026,
      nota: "Solo consideramos filas con FECHA INGRESO 2026+",
    },
  };

  try {
    const hojas = await listarHojas(sede.libroId);
    resultado.hojasDisponibles = hojas;

    const candidatos = hojas.filter((h) =>
      h.toUpperCase().includes("INVENTARIO")
    );
    resultado.hojasInventario = candidatos;

    if (candidatos.length === 0) {
      resultado.error = "No hay hojas con 'INVENTARIO' en el nombre";
      return NextResponse.json(resultado);
    }

    resultado.hojas = {};
    for (const hoja of candidatos) {
      const filas = await leerRango(sede.libroId, `'${hoja}'!A1:Z30`);
      resultado.hojas[hoja] = {
        totalFilasLeidas: filas.length,
        filasConNumero: filas.map((f, i) => ({
          row: i + 1,
          valores: f,
        })),
      };
    }

    // Intentar correr listarDisponibles para ver qué detecta
    try {
      const disponibles = await listarDisponibles(sede.libroId);
      resultado.disponibles = {
        total: disponibles.length,
        muestra: disponibles.slice(0, 10),
      };
    } catch (e: any) {
      resultado.disponibles = { error: e?.message || "Error" };
    }

    return NextResponse.json(resultado);
  } catch (error: any) {
    resultado.error = error?.message || "Error desconocido";
    return NextResponse.json(resultado, { status: 500 });
  }
}

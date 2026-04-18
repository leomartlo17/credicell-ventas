/**
 * Endpoint de diagnóstico.
 * Solo para Leonardo — devuelve la primera fila (headers) y las primeras
 * 5 filas de datos de CLIENTES ESTUDIO. Sirve para verificar que la
 * Service Account puede leer el libro y para ajustar el mapeo de columnas.
 *
 * Protección: requiere sesión válida con sede asignada.
 */
import { getServerSession } from "next-auth";
import { authOptions, SessionConSede } from "@/lib/auth";
import { leerRango, listarHojas } from "@/lib/google-sheets";
import { NextResponse } from "next/server";

export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionConSede | null;
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = session.sede;
  if (!sede) {
    return NextResponse.json(
      { error: "Tu usuario no tiene sede asignada" },
      { status: 403 }
    );
  }

  try {
    // Listar las hojas primero, para ver si CLIENTES ESTUDIO existe y con qué nombre exacto
    const hojas = await listarHojas(sede.libroId);

    // Intentar leer las primeras 6 filas de CLIENTES ESTUDIO (1 header + 5 data)
    let filas: any[][] = [];
    let hojaUsada = "";
    const candidatos = hojas.filter((h) =>
      h.toUpperCase().includes("CLIENTE")
    );
    if (candidatos.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "No encontré una hoja con nombre que contenga 'CLIENTE'",
        hojasDisponibles: hojas,
      });
    }
    hojaUsada = candidatos[0];
    filas = await leerRango(sede.libroId, `'${hojaUsada}'!A1:Z6`);

    const headers = filas[0] || [];
    const datosMuestra = filas.slice(1);

    return NextResponse.json({
      ok: true,
      sede: sede.nombre,
      libroId: sede.libroId,
      hojasDisponibles: hojas,
      hojaUsada,
      headers,
      datosMuestra,
      totalFilasLeidas: filas.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Error desconocido",
        sede: sede.nombre,
        libroId: sede.libroId,
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { agregarFila, actualizarCelda } from "@/lib/google-sheets";
import { sedeDelUsuario } from "@/lib/sedes";

// Escribe la venta en la hoja FINANCIERA y marca el producto como Vendido en Inventario.
//
// Columnas escritas en FINANCIERA:
// A: FECHA | B: NOMBRE | C: CÉDULA | D: TELÉFONO | E: MARCA | F: EQUIPO |
// G: IMEI | H: COLOR | I: TIPO | J: PRECIO VENTA | K: FINANCIERA |
// L: INICIAL | M: CUOTA | N: % KUPO | O: ASESOR

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = sedeDelUsuario(session.user.email);
  if (!sede) {
    return NextResponse.json({ error: "Sin sede asignada" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de petición inválido" }, { status: 400 });
  }

  const { cliente, producto, pago, filaInventario } = body;

  if (!cliente?.cedula || !cliente?.nombre) {
    return NextResponse.json({ error: "Datos del cliente incompletos" }, { status: 400 });
  }
  if (!producto?.imei1) {
    return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
  }
  if (!pago?.financiera || !pago?.valorVenta) {
    return NextResponse.json({ error: "Datos de pago incompletos" }, { status: 400 });
  }

  const fecha = new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
  const asesor = session.user.name || session.user.email;

  const filaFinanciera = [
    fecha,                         // A: FECHA
    cliente.nombre,                // B: NOMBRE
    cliente.cedula,                // C: CÉDULA
    cliente.telefono || "",        // D: TELÉFONO
    producto.marca,                // E: MARCA
    producto.equipo,               // F: EQUIPO
    producto.imei1,                // G: IMEI
    producto.color,                // H: COLOR
    producto.tipo || "Android",    // I: TIPO
    Number(pago.valorVenta),       // J: PRECIO VENTA
    pago.financiera,               // K: FINANCIERA
    Number(pago.inicial) || 0,     // L: INICIAL
    Number(pago.cuota) || 0,       // M: CUOTA
    pago.porcentajeKupo ? `${pago.porcentajeKupo}%` : "", // N: % KUPO (solo iPhone)
    asesor,                        // O: ASESOR
  ];

  try {
    await agregarFila(sede.libroId, "FINANCIERA", filaFinanciera);

    // Marcar el producto como vendido en el inventario
    if (filaInventario && filaInventario > 0) {
      await actualizarCelda(sede.libroId, `Inventario android!H${filaInventario}`, fecha);
      await actualizarCelda(sede.libroId, `Inventario android!I${filaInventario}`, "Vendido");
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

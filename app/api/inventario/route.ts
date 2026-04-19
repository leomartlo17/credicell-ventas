import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { leerRango, agregarFila } from "@/lib/google-sheets";
import { sedeDelUsuario } from "@/lib/sedes";

// Columnas A-K del sheet "Inventario android"
// A: FECHA INGRESO | B: MARCA | C: EQUIPO | D: IMEI 1 | E: IMEI 2 |
// F: COLOR | G: PRECIO COSTO | H: FECHA VENTA | I: ESTADO | J: PROVEEDOR | K: TIPO (nuevo)

function mapearFila(row: any[], fila: number) {
  return {
    fila,
    fechaIngreso: String(row[0] || ""),
    marca: String(row[1] || ""),
    equipo: String(row[2] || ""),
    imei1: String(row[3] || ""),
    imei2: String(row[4] || ""),
    color: String(row[5] || ""),
    precioCosto: Number(row[6]) || 0,
    fechaVenta: String(row[7] || ""),
    estado: String(row[8] || "Disponible"),
    proveedor: String(row[9] || ""),
    tipo: String(row[10] || "Android"),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const sede = sedeDelUsuario(session.user.email);
  if (!sede) {
    return NextResponse.json({ error: "Sin sede asignada" }, { status: 403 });
  }

  try {
    const rows = await leerRango(sede.libroId, "Inventario android!A2:K");
    const productos = rows
      .map((row, i) => mapearFila(row, i + 2))
      .filter((p) => p.marca || p.equipo || p.imei1); // ignorar filas vacías
    return NextResponse.json(productos);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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

  const { marca, equipo, imei1, imei2, color, precioCosto, proveedor, tipo } = body;

  if (!marca?.trim()) return NextResponse.json({ error: "La marca es obligatoria" }, { status: 400 });
  if (!equipo?.trim()) return NextResponse.json({ error: "El equipo es obligatorio" }, { status: 400 });
  if (!imei1?.trim()) return NextResponse.json({ error: "El IMEI 1 es obligatorio" }, { status: 400 });
  if (!/^\d{15}$/.test(imei1)) return NextResponse.json({ error: "IMEI 1 debe tener exactamente 15 dígitos" }, { status: 400 });
  if (imei2 && !/^\d{15}$/.test(imei2)) return NextResponse.json({ error: "IMEI 2 debe tener exactamente 15 dígitos" }, { status: 400 });
  if (!color?.trim()) return NextResponse.json({ error: "El color es obligatorio" }, { status: 400 });
  if (!precioCosto || Number(precioCosto) <= 0) return NextResponse.json({ error: "El precio de costo es obligatorio" }, { status: 400 });
  if (!tipo) return NextResponse.json({ error: "El tipo de equipo es obligatorio" }, { status: 400 });

  const fecha = new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" });

  const fila = [
    fecha,                  // A: FECHA INGRESO
    marca.trim(),           // B: MARCA
    equipo.trim(),          // C: EQUIPO
    imei1.trim(),           // D: IMEI 1
    imei2?.trim() || "",    // E: IMEI 2
    color.trim(),           // F: COLOR
    Number(precioCosto),    // G: PRECIO COSTO
    "",                     // H: FECHA VENTA (vacío al ingresar)
    "Disponible",           // I: ESTADO
    proveedor?.trim() || "", // J: PROVEEDOR
    tipo,                   // K: TIPO (Android/iPhone/Tablet/Accesorio/Otro)
  ];

  try {
    const result = await agregarFila(sede.libroId, "Inventario android", fila);
    return NextResponse.json({ ok: true, fila: result.filaEscrita });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

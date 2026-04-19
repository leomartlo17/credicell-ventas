/**
 * Helper de caja — lee la hoja Ventas 2026 y calcula totales por medio
 * de pago (efectivo, transferencia, Nequi, datáfono, Wompi, caja, otro)
 * para darle a Leonardo un panorama del dinero entrado por canal.
 *
 * Filtra siempre por 2026+ (regla universal) y permite filtrar por
 * período: hoy, mes actual, últimos 30 días, o todo.
 */
import { leerRango, listarHojas } from "@/lib/google-sheets";
import { HOJA_VENTAS, MEDIOS_PAGO, MedioPago } from "@/lib/ventas";

export type Periodo = "hoy" | "mes" | "30dias" | "todo";

export type ResumenCaja = {
  totalVentas: number;       // total facturado (suma de VALOR TOTAL)
  totalAbonado: number;      // total efectivamente cobrado hoy (suma de medios)
  pendienteFinanciera: number; // ventas - abonado = lo cubre financiera
  contadorVentas: number;
  porMedio: Record<MedioPago, number>;
  porFinanciera: Record<string, number>;
  periodo: Periodo;
  desde: string | null;
  hasta: string | null;
};

function normalizarHeader(s: string): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .trim();
}

/**
 * Dado los headers de Ventas 2026, construye un mapa
 * nombreColumna -> indiceColumna (0-indexed).
 */
function mapearColumnasVentas(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const n = normalizarHeader(String(h));
    if (!n) return;
    if (map[n] === undefined) map[n] = i;
  });
  return map;
}

function parseNumero(v: any): number {
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Parsea una fecha que puede venir como:
 * - string "2026-04-19" (ISO)
 * - string "19/04/2026" (dd/mm/yyyy)
 * - string "4/19/2026" (mm/dd/yyyy, Sheets en US locale)
 * - number (serial date de Google)
 *
 * Retorna Date o null si no se pudo parsear.
 */
function parsearFecha(v: any): Date | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    // Serial date Sheets → Date. Día 0 = 1899-12-30.
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms);
  }
  const s = String(v).trim();
  // ISO
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  // dd/mm/yyyy o mm/dd/yyyy — asumimos dd/mm/yyyy porque locale ES
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = Number(dmy[3]);
    // Si primer grupo > 12, es claramente día → dd/mm
    // Si segundo > 12, mm/dd
    // Si ambos <=12, ambiguo — asumimos dd/mm (convención Colombia)
    if (a > 12) return new Date(y, b - 1, a);
    if (b > 12) return new Date(y, a - 1, b);
    return new Date(y, b - 1, a);
  }
  // dd-mm-yyyy
  const dmy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmy2) {
    return new Date(Number(dmy2[3]), Number(dmy2[2]) - 1, Number(dmy2[1]));
  }
  return null;
}

function filtroDesde(periodo: Periodo): Date | null {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  switch (periodo) {
    case "hoy":
      return hoy;
    case "mes":
      return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    case "30dias": {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "todo":
    default:
      return null;
  }
}

export async function resumenCaja(
  libroId: string,
  periodo: Periodo = "mes"
): Promise<ResumenCaja> {
  const vacio: ResumenCaja = {
    totalVentas: 0,
    totalAbonado: 0,
    pendienteFinanciera: 0,
    contadorVentas: 0,
    porMedio: MEDIOS_PAGO.reduce(
      (acc, m) => ({ ...acc, [m]: 0 }),
      {} as Record<MedioPago, number>
    ),
    porFinanciera: {},
    periodo,
    desde: null,
    hasta: null,
  };

  const hojas = await listarHojas(libroId);
  if (!hojas.includes(HOJA_VENTAS)) return vacio;

  const filas = await leerRango(libroId, `'${HOJA_VENTAS}'!A1:Z`);
  if (filas.length < 2) return vacio;

  const headers = (filas[0] || []).map((x) => String(x));
  const cols = mapearColumnasVentas(headers);

  const col = (clave: string) => (cols[clave] !== undefined ? cols[clave] : -1);
  const idxFecha = col("FECHA");
  const idxFinanciera = col("FINANCIERA");
  const idxTotal = col("VALOR TOTAL");
  const idxTotalAbonado = col("TOTAL ABONADO");
  // Medios
  const idxMedios: Record<MedioPago, number> = {
    EFECTIVO: col("EFECTIVO"),
    CAJA: col("CAJA"),
    TRANSFERENCIA: col("TRANSFERENCIA"),
    NEQUI: col("NEQUI"),
    DATAFONO: col("DATAFONO"),
    WOMPI: col("WOMPI"),
    OTRO: col("OTRO"),
  };

  const desdeFecha = filtroDesde(periodo);
  const hoyFin = new Date();

  const resumen: ResumenCaja = {
    ...vacio,
    porMedio: { ...vacio.porMedio },
    porFinanciera: {},
    desde: desdeFecha ? desdeFecha.toISOString().slice(0, 10) : null,
    hasta: hoyFin.toISOString().slice(0, 10),
  };

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    if (idxFecha < 0) continue;
    const fecha = parsearFecha(fila[idxFecha]);
    if (!fecha) continue;
    // Solo 2026+
    if (fecha.getFullYear() < 2026) continue;
    if (desdeFecha && fecha < desdeFecha) continue;

    const total = idxTotal >= 0 ? parseNumero(fila[idxTotal]) : 0;
    const abonadoFila =
      idxTotalAbonado >= 0
        ? parseNumero(fila[idxTotalAbonado])
        : MEDIOS_PAGO.reduce(
            (acc, m) =>
              acc +
              (idxMedios[m] >= 0 ? parseNumero(fila[idxMedios[m]]) : 0),
            0
          );

    resumen.contadorVentas++;
    resumen.totalVentas += total;
    resumen.totalAbonado += abonadoFila;

    for (const medio of MEDIOS_PAGO) {
      const idx = idxMedios[medio];
      if (idx >= 0) {
        resumen.porMedio[medio] += parseNumero(fila[idx]);
      }
    }

    if (idxFinanciera >= 0) {
      const fin = String(fila[idxFinanciera] || "").trim();
      if (fin) {
        resumen.porFinanciera[fin] = (resumen.porFinanciera[fin] || 0) + total;
      }
    }
  }

  resumen.pendienteFinanciera = resumen.totalVentas - resumen.totalAbonado;
  return resumen;
}

/**
 * Helper de ventas.
 * Al cerrar una venta (Paso 3) escribimos en VARIAS hojas:
 *   1. 'Inventario android 2026': marca equipo VENDIDO (FECHA VENTA + ESTADO)
 *   2. 'Ventas 2026': fila resumen legible (1 fila por venta, columnas fijas
 *      para los medios core — legibilidad humana, MASTER con todo).
 *   3. 'DETALLE_PAGOS': filas granulares (1 fila por CADA medio usado —
 *      fuente de verdad para auditoría al peso, permite medios dinámicos).
 *   4. Hoja financiera específica (KREDIYA / ADELANTOS / +KUPO / BOGOTA /
 *      ALCANOS / ADDI / SU+PAY / RENTING) con columnas PROPIAS de esa
 *      financiera, no genéricas.
 *   5. 'Caja 2026': ingreso si hubo efectivo.
 *
 * Regla Leonardo: cada financiera tiene sus propias columnas legibles. Nada
 * de hojas genéricas con columnas vacías que no aplican.
 *
 * Alias: "PAYJOY" es el nombre internacional de "ADELANTOS" (misma empresa).
 * La app expone solo "ADELANTOS" en el dropdown, pero si entra "PAYJOY" por
 * compatibilidad histórica, se normaliza a "ADELANTOS".
 */
import {
  leerRango,
  listarHojas,
  agregarFila,
  actualizarCelda,
  crearHoja,
  escribirRango,
} from "@/lib/google-sheets";
import { buscarPorImei } from "@/lib/inventario";
import {
  MEDIOS_CORE,
  normalizarNombreMedio,
  escribirDetallePagos,
} from "@/lib/medios-pago";

export const HOJA_VENTAS = "Ventas 2026";

/**
 * Porcentajes de cuota inicial estándar que ofrecen las financieras.
 */
export const PORCENTAJES_INICIAL = [20, 25, 30, 35, 40, 45, 50] as const;

/**
 * Tasa de comisión al cliente por financiera. El cliente paga la comisión
 * en efectivo adicional o financiada dentro del precio registrado en la
 * financiera (precio inflado).
 */
const TASAS_COMISION: Record<string, number> = {
  ADDI: 0.04165,
  "SU+PAY": 0.019,
  ALCANOS: 0.05,
};

/**
 * Tipo de schema de conciliación que usa cada financiera:
 *  - "kredit-cuota": KREDIYA / ADELANTOS / +KUPO / BOGOTA (cuota inicial +
 *    descuento + financiado). Todas comparten las mismas columnas.
 *  - "comision":      ADDI / SU+PAY / ALCANOS (tasa al cliente + modo de pago).
 *  - "renting":       RENTING (cuota inicial real + financiado, máx iPhone $3M).
 */
type TipoSchema = "kredit-cuota" | "comision" | "renting";

const TIPO_POR_FINANCIERA: Record<string, TipoSchema> = {
  KREDIYA: "kredit-cuota",
  ADELANTOS: "kredit-cuota",
  "+KUPO": "kredit-cuota",
  BOGOTA: "kredit-cuota",
  ADDI: "comision",
  "SU+PAY": "comision",
  ALCANOS: "comision",
  RENTING: "renting",
};

/**
 * Alias de financieras. Si entra un nombre histórico o alternativo, se
 * normaliza al nombre canónico antes de procesar. Evita duplicar hojas.
 */
const ALIAS_FINANCIERA: Record<string, string> = {
  PAYJOY: "ADELANTOS",  // PAYJOY opera en Colombia como ADELANTOS
};

function normalizarFinanciera(nombre: string): string {
  const f = (nombre || "").trim().toUpperCase();
  return ALIAS_FINANCIERA[f] || f;
}

const FINANCIERAS_CON_HOJA_PROPIA = Object.keys(TIPO_POR_FINANCIERA);

/**
 * Headers específicos por tipo de schema. Cada uno refleja EXACTAMENTE
 * lo que el equipo de conciliación necesita para cuadrar con la financiera.
 */
const HEADERS_KREDIT_CUOTA = [
  "FECHA",
  "ASESOR",
  "CEDULA",
  "CLIENTE",
  "MARCA",
  "EQUIPO",
  "COLOR",
  "IMEI",
  "VALOR VENTA",
  "% INICIAL",
  "VALOR %",
  "VALOR RECIBIDO",
  "DESCUENTO",
  "VALOR FINANCIADO",
  "EFECTIVO",
  "CAJA",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
  "OTRO",
  "TOTAL PAGADO",
  "OBSERVACIONES",
];

const HEADERS_COMISION = [
  "FECHA",
  "ASESOR",
  "CEDULA",
  "CLIENTE",
  "MARCA",
  "EQUIPO",
  "COLOR",
  "IMEI",
  "VALOR VENTA",
  "TASA %",
  "MODO COMISION",
  "COMISION EN $",
  "PRECIO REGISTRADO EN FINANCIERA",
  "EFECTIVO",
  "CAJA",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
  "OTRO",
  "TOTAL PAGADO",
  "OBSERVACIONES",
];

const HEADERS_RENTING = [
  "FECHA",
  "ASESOR",
  "CEDULA",
  "CLIENTE",
  "MARCA",
  "EQUIPO",
  "COLOR",
  "IMEI",
  "VALOR VENTA",
  "% INICIAL",
  "INICIAL PAGADO",
  "FINANCIADO",
  "EFECTIVO",
  "CAJA",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
  "OTRO",
  "TOTAL PAGADO",
  "OBSERVACIONES",
];

/**
 * HEADERS_VENTAS: hoja maestra 'Ventas 2026'. Contiene TODAS las columnas
 * específicas de cada financiera (al final). Mantener compatibilidad con
 * datos históricos — NO alterar posiciones de columnas ya existentes.
 */
const HEADERS_VENTAS = [
  "FECHA",
  "ASESOR",
  "CEDULA",
  "CLIENTE",
  "MARCA",
  "EQUIPO",
  "COLOR",
  "IMEI",
  "FINANCIERA",
  "VALOR TOTAL",
  "% CUOTA",
  "VALOR CUOTA",
  "EFECTIVO",
  "CAJA",
  "TRANSFERENCIA",
  "NEQUI",
  "DATAFONO",
  "WOMPI",
  "OTRO",
  "TOTAL ABONADO",
  "OBSERVACIONES",
  "PAGO COMISION ADDI",
  "COMISION ADDI",
  "PRECIO ADDI",
  "PAGO COMISION SUPAY",
  "COMISION SUPAY",
  "PRECIO SUPAY",
  "PORCENTAJE RENTING",
  "INICIAL RENTING",
  "PAGO COMISION ALCANOS",
  "COMISION ALCANOS",
  "PRECIO ALCANOS",
];

/**
 * Una entrada del desglose de pagos. El medio viene tal cual del catálogo
 * (nombre normalizado UPPERCASE). Este es el formato unificado entre
 * frontend → API → guardarVenta → DETALLE_PAGOS.
 */
export type EntradaPago = {
  medio: string;
  valor: number;
};

/**
 * Co-financiación — cuando el cliente divide la compra entre 2 financieras.
 * La financiera PRINCIPAL (la del mayor monto, guardada en VentaInput.financiera)
 * es la que aparece en Ventas 2026 y la que se reporta a Cartera como "la
 * financiera del crédito". La secundaria se registra en SU hoja propia con
 * el valor asignado, pero NO aparece en Ventas 2026 como fila separada — se
 * menciona en OBSERVACIONES con el formato "[+Co-financiera: NOMBRE $MONTO]".
 *
 * Para 3+ financieras simultáneas (raro), agregar más slots en el futuro.
 */
export type CoFinanciacion = {
  financiera: string;
  valor: number;                // monto asignado a esta financiera
  porcentajeCuota?: number;     // solo aplica si es tipo kredit-cuota
  valorRecibir?: number;        // cuota inicial real cobrada (solo kredit-cuota)
};

export type VentaInput = {
  cedula: string;
  clienteNombre: string;
  marca: string;
  equipo: string;
  color: string;
  imei: string;
  filaInventario: number;
  financiera: string;           // PRINCIPAL (la de mayor monto)
  valorTotal: number;           // valor total del producto
  valorFinancieraPrincipal?: number;  // monto asignado a la principal (si hay co-financiación); si no viene, se asume igual a valorTotal
  porcentajeCuota?: number;
  /**
   * Solo para KREDIYA / ADELANTOS / +KUPO / BOGOTA. Cuota inicial REAL que
   * cobra el asesor; puede ser menor al valor % oficial si se hizo descuento.
   */
  valorRecibir?: number;
  pagos: EntradaPago[];
  observaciones?: string;
  pagoComisionAddi?: string;
  comisionAddi?: number;
  precioAddi?: number;
  pagoComisionSupay?: string;
  comisionSupay?: number;
  precioSupay?: number;
  porcentajeRenting?: number;
  inicialRenting?: number;
  pagoComisionAlcanos?: string;
  comisionAlcanos?: number;
  precioAlcanos?: number;
  asesor: string;
  /** Hasta 1 co-financiación adicional. Si el cliente usó 2 financieras. */
  coFinanciacion?: CoFinanciacion;
};

async function asegurarHojaVentas(libroId: string): Promise<string> {
  const hojas = await listarHojas(libroId);
  if (hojas.includes(HOJA_VENTAS)) return HOJA_VENTAS;
  await crearHoja(libroId, HOJA_VENTAS);
  await escribirRango(libroId, `'${HOJA_VENTAS}'!A1`, [HEADERS_VENTAS]);
  return HOJA_VENTAS;
}

function nombreHojaFinanciera(financiera: string): string | null {
  const f = normalizarFinanciera(financiera);
  if (!f) return null;
  if (!FINANCIERAS_CON_HOJA_PROPIA.includes(f)) return null;
  return `${f} 2026`;
}

function headersParaFinanciera(financiera: string): string[] | null {
  const f = normalizarFinanciera(financiera);
  const tipo = TIPO_POR_FINANCIERA[f];
  if (!tipo) return null;
  if (tipo === "kredit-cuota") return HEADERS_KREDIT_CUOTA;
  if (tipo === "comision") return HEADERS_COMISION;
  if (tipo === "renting") return HEADERS_RENTING;
  return null;
}

async function asegurarHojaFinanciera(
  libroId: string,
  financiera: string
): Promise<string | null> {
  const nombre = nombreHojaFinanciera(financiera);
  if (!nombre) return null;
  const hojas = await listarHojas(libroId);
  if (hojas.includes(nombre)) return nombre;
  const headers = headersParaFinanciera(financiera);
  if (!headers) return null;
  await crearHoja(libroId, nombre);
  await escribirRango(libroId, `'${nombre}'!A1`, [headers]);
  return nombre;
}

async function marcarVendidoEnInventario(
  libroId: string,
  hojaInv: string,
  filaNumero: number,
  fechaVenta: string
): Promise<void> {
  const headerRow = await leerRango(libroId, `'${hojaInv}'!A1:Z1`);
  const headers = (headerRow[0] || []).map((x) => String(x || "").toUpperCase());
  let idxFechaVenta = -1;
  let idxEstado = -1;
  for (let i = 0; i < headers.length; i++) {
    if (idxFechaVenta < 0 && headers[i].includes("FECHA") && headers[i].includes("VENTA")) {
      idxFechaVenta = i;
    }
    if (idxEstado < 0 && (headers[i].includes("ESTADO") || headers[i].includes("STATUS"))) {
      idxEstado = i;
    }
  }
  const letraCol = (i: number) => String.fromCharCode(65 + i);
  if (idxFechaVenta >= 0) {
    await actualizarCelda(
      libroId,
      `'${hojaInv}'!${letraCol(idxFechaVenta)}${filaNumero}`,
      fechaVenta
    );
  }
  if (idxEstado >= 0) {
    await actualizarCelda(
      libroId,
      `'${hojaInv}'!${letraCol(idxEstado)}${filaNumero}`,
      "VENDIDO"
    );
  }
}

/**
 * Agrupa un array de EntradaPago en un mapa de monto por medio core.
 * Medios dinámicos (no-core) se suman en el balde "OTRO" y se listan en
 * un texto "detalle" para adjuntar a OBSERVACIONES.
 */
function agruparPagosParaResumen(pagos: EntradaPago[]): {
  core: Record<string, number>;
  detalleOtros: string;
  total: number;
} {
  const coreSet = new Set<string>(MEDIOS_CORE);
  const core: Record<string, number> = {};
  for (const m of MEDIOS_CORE) core[m] = 0;

  const otrosMap: Record<string, number> = {};
  let total = 0;

  for (const p of pagos) {
    const medio = normalizarNombreMedio(p.medio);
    const valor = Number(p.valor) || 0;
    if (valor <= 0) continue;
    total += valor;
    if (coreSet.has(medio)) {
      core[medio] = (core[medio] || 0) + valor;
    } else {
      core["OTRO"] = (core["OTRO"] || 0) + valor;
      otrosMap[medio] = (otrosMap[medio] || 0) + valor;
    }
  }

  const detalleOtros = Object.entries(otrosMap)
    .map(([medio, valor]) => `${medio}: $${valor.toLocaleString("es-CO")}`)
    .join(" | ");

  return { core, detalleOtros, total };
}

/**
 * Contexto para construir la fila de la hoja financiera específica.
 */
type ContextoFila = {
  fechaHoy: string;
  venta: VentaInput;
  core: Record<string, number>;
  totalAbonado: number;
  observacionesFinal: string;
};

/**
 * Formatea tasa de comisión como porcentaje legible (ej: "5%", "1.9%", "4.165%").
 */
function formatearTasa(tasa: number): string {
  const pct = tasa * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(3).replace(/\.?0+$/, "")}%`;
}

/**
 * Construye la fila de la hoja financiera específica según el tipo de schema.
 * Devuelve null si la financiera no tiene hoja propia.
 */
function filaParaFinanciera(financiera: string, ctx: ContextoFila): any[] | null {
  const f = normalizarFinanciera(financiera);
  const tipo = TIPO_POR_FINANCIERA[f];
  if (!tipo) return null;

  const { fechaHoy, venta, core, totalAbonado, observacionesFinal } = ctx;
  const baseIdentidad = [
    fechaHoy,
    venta.asesor,
    venta.cedula,
    venta.clienteNombre,
    venta.marca,
    venta.equipo,
    venta.color || "",
    venta.imei,
  ];
  const mediosCoreCols = [
    core["EFECTIVO"] || "",
    core["CAJA"] || "",
    core["TRANSFERENCIA"] || "",
    core["NEQUI"] || "",
    core["DATAFONO"] || "",
    core["WOMPI"] || "",
    core["OTRO"] || "",
  ];

  if (tipo === "kredit-cuota") {
    const pct = venta.porcentajeCuota || 0;
    const valorPctOficial = pct > 0 ? Math.round((venta.valorTotal * pct) / 100) : 0;
    const valorRecibir =
      venta.valorRecibir !== undefined && venta.valorRecibir !== null
        ? venta.valorRecibir
        : totalAbonado;
    const descuento = valorPctOficial > 0 ? valorPctOficial - valorRecibir : 0;
    const valorFinanciado = pct > 0 ? venta.valorTotal - valorPctOficial : 0;
    return [
      ...baseIdentidad,
      venta.valorTotal,
      venta.porcentajeCuota ?? "",
      valorPctOficial || "",
      valorRecibir,
      descuento || "",
      valorFinanciado || "",
      ...mediosCoreCols,
      totalAbonado,
      observacionesFinal,
    ];
  }

  if (tipo === "comision") {
    const tasa = TASAS_COMISION[f] || 0;
    let modoComision = "";
    let comisionEnDolares: number | "" = "";
    let precioRegistrado: number = venta.valorTotal;

    if (f === "ADDI") {
      modoComision = venta.pagoComisionAddi || "";
      if (modoComision === "efectivo") {
        comisionEnDolares = venta.comisionAddi || 0;
        precioRegistrado = venta.valorTotal;
      } else if (modoComision === "addi" || modoComision === "dentro") {
        precioRegistrado = venta.precioAddi || venta.valorTotal;
        comisionEnDolares = precioRegistrado - venta.valorTotal;
      }
    } else if (f === "SU+PAY") {
      modoComision = venta.pagoComisionSupay || "";
      if (modoComision === "efectivo") {
        comisionEnDolares = venta.comisionSupay || 0;
        precioRegistrado = venta.valorTotal;
      } else if (modoComision === "supay" || modoComision === "dentro") {
        precioRegistrado = venta.precioSupay || venta.valorTotal;
        comisionEnDolares = precioRegistrado - venta.valorTotal;
      }
    } else if (f === "ALCANOS") {
      modoComision = venta.pagoComisionAlcanos || "";
      if (modoComision === "efectivo") {
        comisionEnDolares = venta.comisionAlcanos || 0;
        precioRegistrado = venta.valorTotal;
      } else if (modoComision === "alcanos" || modoComision === "dentro") {
        precioRegistrado = venta.precioAlcanos || venta.valorTotal;
        comisionEnDolares = precioRegistrado - venta.valorTotal;
      }
    }

    return [
      ...baseIdentidad,
      venta.valorTotal,
      formatearTasa(tasa),
      modoComision || "",
      comisionEnDolares || "",
      precioRegistrado,
      ...mediosCoreCols,
      totalAbonado,
      observacionesFinal,
    ];
  }

  if (tipo === "renting") {
    const inicial = venta.inicialRenting || 0;
    const financiado = venta.valorTotal - inicial;
    return [
      ...baseIdentidad,
      venta.valorTotal,
      venta.porcentajeRenting ?? "",
      inicial || "",
      financiado || "",
      ...mediosCoreCols,
      totalAbonado,
      observacionesFinal,
    ];
  }

  return null;
}

/**
 * Ejecuta el cierre de venta completo.
 */
export async function guardarVenta(
  libroId: string,
  hojaInv: string,
  venta: VentaInput
): Promise<{ ok: true; filaVenta: number }> {
  const prod = await buscarPorImei(libroId, venta.imei);
  if (!prod) throw new Error(`IMEI ${venta.imei} no existe en inventario`);
  if (!prod.disponible) {
    throw new Error(
      `El equipo IMEI ${venta.imei} ya fue vendido. Recarga el inventario.`
    );
  }

  const fechaHoy = new Date().toISOString().slice(0, 10);

  // 1) Marcar vendido en inventario
  await marcarVendidoEnInventario(libroId, hojaInv, venta.filaInventario, fechaHoy);

  const pagosLimpios: EntradaPago[] = (venta.pagos || [])
    .map((p) => ({
      medio: normalizarNombreMedio(p.medio),
      valor: Number(p.valor) || 0,
    }))
    .filter((p) => p.valor > 0 && p.medio);

  const { core, detalleOtros, total: totalAbonado } =
    agruparPagosParaResumen(pagosLimpios);

  // Nota de co-financiación para OBSERVACIONES (si aplica)
  const cof = venta.coFinanciacion;
  const cofNotaObs = cof && cof.financiera && Number(cof.valor) > 0
    ? `[+Co-financiera: ${cof.financiera.toUpperCase()} $${Number(cof.valor).toLocaleString("es-CO")}]`
    : "";

  const observacionesFinal = [
    venta.observaciones?.trim(),
    detalleOtros ? `[Otros medios: ${detalleOtros}]` : "",
    cofNotaObs,
  ]
    .filter(Boolean)
    .join(" ");

  // 2) Escribir fila resumen en Ventas 2026 (master)
  const hojaVen = await asegurarHojaVentas(libroId);
  const filaVentas = [
    fechaHoy,
    venta.asesor,
    venta.cedula,
    venta.clienteNombre,
    venta.marca,
    venta.equipo,
    venta.color || "",
    venta.imei,
    venta.financiera,
    venta.valorTotal,
    venta.porcentajeCuota ?? "",
    "", // VALOR CUOTA (legado)
    core["EFECTIVO"] || "",
    core["CAJA"] || "",
    core["TRANSFERENCIA"] || "",
    core["NEQUI"] || "",
    core["DATAFONO"] || "",
    core["WOMPI"] || "",
    core["OTRO"] || "",
    totalAbonado,
    observacionesFinal,
    venta.pagoComisionAddi ?? "",
    venta.comisionAddi ?? "",
    venta.precioAddi ?? "",
    venta.pagoComisionSupay ?? "",
    venta.comisionSupay ?? "",
    venta.precioSupay ?? "",
    venta.porcentajeRenting ?? "",
    venta.inicialRenting ?? "",
    venta.pagoComisionAlcanos ?? "",
    venta.comisionAlcanos ?? "",
    venta.precioAlcanos ?? "",
  ];
  const { filaEscrita } = await agregarFila(libroId, hojaVen, filaVentas);

  // 3) Escribir DETALLE_PAGOS granular (1 fila por medio)
  await escribirDetallePagos(libroId, {
    fecha: fechaHoy,
    ventaId: filaEscrita,
    cedula: venta.cedula,
    cliente: venta.clienteNombre,
    imei: venta.imei,
    asesor: venta.asesor,
    financiera: venta.financiera,
    pagos: pagosLimpios,
  });

  // 4) Hoja financiera PRINCIPAL — con columnas propias de esa financiera.
  //    Si hay co-financiación, la principal recibe solo el monto asignado a
  //    ella (valorFinancieraPrincipal si viene, si no el total).
  const valorPrincipal =
    Number(venta.valorFinancieraPrincipal) > 0
      ? Number(venta.valorFinancieraPrincipal)
      : venta.valorTotal;
  const hojaFin = await asegurarHojaFinanciera(libroId, venta.financiera);
  if (hojaFin) {
    const filaFinanciera = filaParaFinanciera(venta.financiera, {
      fechaHoy,
      venta: { ...venta, valorTotal: valorPrincipal },
      core,
      totalAbonado,
      observacionesFinal,
    });
    if (filaFinanciera) {
      await agregarFila(libroId, hojaFin, filaFinanciera);
    }
  }

  // 4b) Co-financiación (si aplica) — escribe en la hoja de la SEGUNDA financiera
  //     con el monto asignado a ella. NO duplica medios de pago ni caja — esos
  //     se registran solo en la principal. La co-financiación es contable: deja
  //     constancia de que ESE crédito existe y el valor que cubre.
  if (cof && cof.financiera && Number(cof.valor) > 0) {
    try {
      const hojaFinSec = await asegurarHojaFinanciera(libroId, cof.financiera);
      if (hojaFinSec) {
        // Contexto virtual: financiera secundaria ve SU monto como "valorTotal"
        // y NO se le asignan medios de pago (columnas de pago en 0/"").
        const ventaSecundaria: VentaInput = {
          ...venta,
          financiera: cof.financiera,
          valorTotal: Number(cof.valor),
          porcentajeCuota: cof.porcentajeCuota,
          valorRecibir: cof.valorRecibir,
          // Sin medios — se anota en observaciones que es co-financiación
          pagos: [],
          coFinanciacion: undefined,  // evitar recursión
        };
        const coreVacio: Record<string, number> = {};
        for (const m of Object.keys(core)) coreVacio[m] = 0;
        const filaSec = filaParaFinanciera(cof.financiera, {
          fechaHoy,
          venta: ventaSecundaria,
          core: coreVacio,
          totalAbonado: 0,
          observacionesFinal: `[Co-financiación junto con ${venta.financiera.toUpperCase()} $${valorPrincipal.toLocaleString("es-CO")}] ${venta.observaciones || ""}`.trim(),
        });
        if (filaSec) {
          await agregarFila(libroId, hojaFinSec, filaSec);
        }
      }
    } catch (e) {
      // No bloquear la venta si falla la co-financiación — solo loggear.
      console.error("Error escribiendo co-financiación:", e);
    }
  }

  // 5) Si hubo efectivo, registrar INGRESO en Caja 2026
  const efectivoTotal = core["EFECTIVO"] || 0;
  if (efectivoTotal > 0) {
    const { registrarMovimiento } = await import("@/lib/caja");
    await registrarMovimiento(libroId, {
      tipo: "INGRESO",
      concepto:
        venta.financiera.toUpperCase() === "CONTADO"
          ? "VENTA CONTADO"
          : "INICIAL CREDITO",
      establecimiento: venta.clienteNombre,
      monto: efectivoTotal,
      asesor: venta.asesor,
      referencia: `IMEI ${venta.imei} · CC ${venta.cedula}`,
      observaciones: `Efectivo de ${venta.marca} ${venta.equipo} (${venta.financiera})`,
    });
  }

  return { ok: true, filaVenta: filaEscrita };
}

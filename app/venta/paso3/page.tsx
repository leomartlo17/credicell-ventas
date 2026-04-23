"use client";

export const dynamic = "force-dynamic";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

export default function Paso3Wrapper() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-sm">Cargando...</p>
        </main>
      }
    >
      <Paso3Pago />
    </Suspense>
  );
}

type Producto = {
  marca: string;
  equipo: string;
  tipoEquipo?: string;
  color: string;
  imei: string;
  precioCosto?: number;
  fila: number;
};

type Cliente = {
  cedula: string;
  nombre: string;
  telefono?: string;
};

type SedeInfo = {
  id: string;
  nombre: string;
  financieras: string[];
};

type MedioCatalogo = {
  nombre: string;
  activo: boolean;
  esCore: boolean;
};

type Estado =
  | { tipo: "cargando" }
  | { tipo: "listo" }
  | { tipo: "guardando" }
  | { tipo: "ok"; filaVenta: number }
  | { tipo: "error"; mensaje: string };

function Paso3Pago() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cedula = searchParams.get("cedula") || "";
  const imei = searchParams.get("imei") || "";
  const filaInv = parseInt(searchParams.get("fila") || "0", 10);

  const [producto, setProducto] = useState<Producto | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [sedeInfo, setSedeInfo] = useState<SedeInfo | null>(null);
  const [medios, setMedios] = useState<MedioCatalogo[]>([]);
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  // Medios seleccionados en esta venta. Orden importa (como los agregó
  // el asesor). Cada uno tiene su monto. Si el asesor quita un medio,
  // desaparece del arreglo.
  const [seleccionados, setSeleccionados] = useState<
    { medio: string; valor: string }[]
  >([]);
  // Control UI: mostrar u ocultar el selector de "agregar medio"
  const [mostrarSelector, setMostrarSelector] = useState(false);
  // Crear medio nuevo inline (solo admin)
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [nuevoMedioNombre, setNuevoMedioNombre] = useState("");
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState("");

  const [form, setForm] = useState({
    financiera: "",
    valorTotal: "",
    porcentajeCuota: "",
    porcentajeKupo: "20",
    cuotaKupo: "",
    pagoComisionAddi: "",
    pagoComisionSupay: "",
    pagoComisionAlcanos: "",
    porcentajeRenting: "",
    cuotaRenting: "",
    valorRecibir: "",
    observaciones: "",
    // [legado - ya no se usa, reemplazado por coFinanciaciones array]
    usaCoFinanciacion: false,
    cofFinanciera: "",
    cofValor: "",
    cofPorcentajeCuota: "",
    cofValorRecibir: "",
    cofModoComision: "",
  });

  // Co-financiaciones: array dinámico (N financieras cubren partes de la cuota inicial).
  type CofUI = {
    financiera: string;
    monto: string;                  // lo que cubre esta financiera (editable)
    modoComision: string;           // "efectivo" | "dentro" — si es ADDI/SU+PAY/ALCANOS
    porcentajeCuota: string;        // si es BOGOTA
    valorRecibir: string;           // si es BOGOTA
  };
  const [coFinanciaciones, setCoFinanciaciones] = useState<CofUI[]>([]);
  const addCof = () => setCoFinanciaciones((p) => [...p, { financiera: "", monto: "", modoComision: "", porcentajeCuota: "", valorRecibir: "" }]);
  const updateCof = (i: number, k: keyof CofUI, v: string) =>
    setCoFinanciaciones((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const removeCof = (i: number) => setCoFinanciaciones((p) => p.filter((_, j) => j !== i));

  const esAdmin = Boolean((session as any)?.esAdmin);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!cedula || !imei) {
      setEstado({
        tipo: "error",
        mensaje: "Faltan datos de la venta (cédula o IMEI). Vuelve al Paso 1.",
      });
      return;
    }
    (async () => {
      try {
        const [rProd, rCliente, rSede, rMedios] = await Promise.all([
          fetch(`/api/producto/buscar-imei?imei=${imei}`),
          fetch(`/api/cliente/buscar?cedula=${cedula}`),
          fetch(`/api/sede/info`),
          fetch(`/api/medios-pago`),
        ]);
        const dProd = await rProd.json();
        const dCliente = await rCliente.json();
        const dSede = await rSede.json();
        const dMedios = await rMedios.json();

        if (!rProd.ok) {
          setEstado({
            tipo: "error",
            mensaje: dProd.error || "Error al cargar producto",
          });
          return;
        }
        if (!dProd.encontrado) {
          setEstado({ tipo: "error", mensaje: "Producto no encontrado" });
          return;
        }
        if (dProd.disponible === false) {
          setEstado({
            tipo: "error",
            mensaje: dProd.error || "Este equipo ya fue vendido",
          });
          return;
        }
        if (!dCliente.encontrado) {
          setEstado({
            tipo: "error",
            mensaje: "Cliente no encontrado. Vuelve a Paso 1.",
          });
          return;
        }
        setProducto(dProd.producto);
        setCliente(dCliente.cliente);
        setSedeInfo(dSede);
        // Medios activos del catálogo dinámico
        // Si falla el endpoint, no bloqueamos toda la venta — usamos lista
        // mínima para que el asesor pueda seguir.
        const mediosList: MedioCatalogo[] = Array.isArray(dMedios?.medios)
          ? dMedios.medios
          : [];
        setMedios(
          mediosList.length > 0
            ? mediosList
            : [
                { nombre: "EFECTIVO", activo: true, esCore: true },
                { nombre: "TRANSFERENCIA", activo: true, esCore: true },
                { nombre: "NEQUI", activo: true, esCore: true },
                { nombre: "DATAFONO", activo: true, esCore: true },
                { nombre: "WOMPI", activo: true, esCore: true },
              ]
        );
        setEstado({ tipo: "listo" });
      } catch (e: any) {
        setEstado({ tipo: "error", mensaje: e?.message || "Error de red" });
      }
    })();
  }, [status, cedula, imei]);

  function actualizar(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function agregarMedio(medio: string) {
    setSeleccionados((s) => {
      if (s.some((x) => x.medio === medio)) return s; // ya está
      return [...s, { medio, valor: "" }];
    });
    setMostrarSelector(false);
  }

  function quitarMedio(medio: string) {
    setSeleccionados((s) => s.filter((x) => x.medio !== medio));
  }

  function setValorMedio(medio: string, valor: string) {
    const limpio = valor.replace(/[^\d.]/g, "");
    setSeleccionados((s) =>
      s.map((x) => (x.medio === medio ? { ...x, valor: limpio } : x))
    );
  }

  async function crearNuevoMedio() {
    const nombre = nuevoMedioNombre.trim();
    if (nombre.length < 2) {
      setErrorNuevo("Mínimo 2 caracteres");
      return;
    }
    setGuardandoNuevo(true);
    setErrorNuevo("");
    try {
      const r = await fetch("/api/medios-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setErrorNuevo(d.error || "Error al crear");
        return;
      }
      // El medio se agregó al catálogo — meterlo en la lista local y
      // seleccionarlo para esta venta inmediatamente.
      const nuevo: MedioCatalogo = {
        nombre: d.medio.nombre,
        activo: true,
        esCore: false,
      };
      setMedios((prev) => [...prev, nuevo]);
      agregarMedio(d.medio.nombre);
      setCreandoNuevo(false);
      setNuevoMedioNombre("");
    } catch (e: any) {
      setErrorNuevo(e?.message || "Error de red");
    } finally {
      setGuardandoNuevo(false);
    }
  }

  // Cálculos derivados
  const valorTotalNum = Number(form.valorTotal) || 0;
  const pagadoNum = useMemo(() => {
    return seleccionados.reduce((sum, s) => sum + (Number(s.valor) || 0), 0);
  }, [seleccionados]);
  const restante = valorTotalNum - pagadoNum;
  const esContado = form.financiera.toUpperCase() === "CONTADO";
  const pctNum = Number(form.porcentajeCuota) || 0;
  const valorPctOficial = pctNum > 0 ? Math.round((valorTotalNum * pctNum) / 100) : 0;
  const valorRecibirNum = Number(form.valorRecibir) || 0;
  const descuentoFinanciera = valorPctOficial > 0 ? valorPctOficial - valorRecibirNum : 0;
  const diferenciaMedios = valorRecibirNum - pagadoNum;
  // KREDIYA, ADELANTOS (= PAYJOY) y BOGOTA usan el flujo de cuota inicial +
  // descuento + financiado. Mantengo el alias "PAYJOY" por compatibilidad.
  const esKrediyaOAdelantos =
    form.financiera === "KREDIYA" ||
    form.financiera === "ADELANTOS" ||
    form.financiera === "PAYJOY" ||
    form.financiera === "BOGOTA";
  // Alias para no romper referencias existentes en este archivo.
  const esKrediyaOPayJoy = esKrediyaOAdelantos;

  // +Kupo con iPhone: flujo especial con % de inicial
  const esKupoIphone =
    form.financiera === "+KUPO" && (
      producto?.tipoEquipo?.toLowerCase() === "iphone" ||
      producto?.equipo?.toLowerCase().includes("iphone")
    );
  const esKupoAndroid =
    form.financiera === "+KUPO" && !esKupoIphone;
  const precioKupo = valorTotalNum || producto?.precioCosto || 0;
  const minPctKupo = precioKupo <= 3_000_000
    ? 20
    : Math.min(80, Math.max(20, Math.ceil(((precioKupo - 3_000_000) / precioKupo) * 100)));
  const pctKupoNum = Math.max(minPctKupo, Number(form.porcentajeKupo) || minPctKupo);
  const cuotaKupoDigitada = parseInt(form.cuotaKupo) || 0;
  const inicialKupo = cuotaKupoDigitada > 0 ? cuotaKupoDigitada : Math.round(precioKupo * pctKupoNum / 100);
  const pctKupoReal = precioKupo > 0 && cuotaKupoDigitada > 0
    ? Math.round(cuotaKupoDigitada / precioKupo * 10000) / 100
    : pctKupoNum;
  const financiadoKupo = precioKupo - inicialKupo;
  // RENTING (solo iPhone): mismo flujo que +Kupo iPhone
  const esIphone =
    producto?.tipoEquipo?.toLowerCase() === "iphone" ||
    producto?.equipo?.toLowerCase().includes("iphone");
  const esRenting = form.financiera === "RENTING";
  const precioRenting = valorTotalNum || producto?.precioCosto || 0;
  const minPctRenting = precioRenting <= 3_000_000
    ? 20
    : Math.min(80, Math.max(20, Math.ceil(((precioRenting - 3_000_000) / precioRenting) * 100)));
  const pctRentingNum = Math.max(minPctRenting, Number(form.porcentajeRenting) || minPctRenting);
  const cuotaRentingDigitada = parseInt(form.cuotaRenting) || 0;
  const inicialRenting = cuotaRentingDigitada > 0 ? cuotaRentingDigitada : Math.round(precioRenting * pctRentingNum / 100);
  const pctRentingActual = cuotaRentingDigitada > 0
    ? Math.round(cuotaRentingDigitada / precioRenting * 10000) / 100
    : pctRentingNum;
  const financiadoRenting = precioRenting - inicialRenting;
  const esAddi = form.financiera === "ADDI";
  const ADDI_RATE = 0.04165;
  const comisionAddiEfectivo = esAddi && valorTotalNum > 0 ? Math.round(valorTotalNum * ADDI_RATE) : 0;
  const precioAddiFinanciado = esAddi && valorTotalNum > 0 ? Math.round(valorTotalNum / (1 - ADDI_RATE)) : 0;
  const comisionAddiFinanciada = precioAddiFinanciado - valorTotalNum;
  const diferenciaAddi = esAddi && form.pagoComisionAddi === "efectivo" ? comisionAddiEfectivo - pagadoNum : 0;
  const esSupay = form.financiera === "SU+PAY";
  const SUPAY_RATE = 0.019;
  const comisionSupayEfectivo = esSupay && valorTotalNum > 0 ? Math.round(valorTotalNum * SUPAY_RATE) : 0;
  const precioSupayFinanciado = esSupay && valorTotalNum > 0 ? Math.round(valorTotalNum / (1 - SUPAY_RATE)) : 0;
  const comisionSupayFinanciada = precioSupayFinanciado - valorTotalNum;
  const diferenciaSupay = esSupay && form.pagoComisionSupay === "efectivo" ? comisionSupayEfectivo - pagadoNum : 0;
  const esAlcanos = form.financiera === "ALCANOS";
  const ALCANOS_RATE = 0.05;
  const comisionAlcanosEfectivo = esAlcanos && valorTotalNum > 0 ? Math.round(valorTotalNum * ALCANOS_RATE) : 0;
  const precioAlcanosFinanciado = esAlcanos && valorTotalNum > 0 ? Math.round(valorTotalNum / (1 - ALCANOS_RATE)) : 0;
  const comisionAlcanosFinanciada = precioAlcanosFinanciado - valorTotalNum;
  const diferenciaAlcanos = esAlcanos && form.pagoComisionAlcanos === "efectivo" ? comisionAlcanosEfectivo - pagadoNum : 0;

  // ====== Co-financiaciones (array de N) ======
  // Reglas:
  // - La PRINCIPAL solo puede ser KREDIYA/+KUPO/ADELANTOS/RENTING/Contado.
  // - Las secundarias NO pueden ser ninguna de las 3 de cuota inicial
  //   (KREDIYA/+KUPO/ADELANTOS) ni la misma principal ni Contado.
  // - Cada secundaria cubre una parte del monto de la cuota inicial.
  // - Suma de montos de secundarias + efectivo_en_caja = cuota_inicial.
  const FINANCIERAS_CUOTA_INICIAL_SET = ["KREDIYA", "+KUPO", "ADELANTOS"];
  const principalEsCuotaInicial = FINANCIERAS_CUOTA_INICIAL_SET.includes(form.financiera);

  // Financieras permitidas como CO-FINANCIERAS (secundarias).
  const financierasCoDisponibles = (sedeInfo?.financieras || [])
    .filter((f) => {
      if (FINANCIERAS_CUOTA_INICIAL_SET.includes(f)) return false; // excluir las 3 de cuota inicial
      if (f === form.financiera) return false;
      if (f.toUpperCase() === "CONTADO") return false;
      if (f === "RENTING") return false; // RENTING solo como principal (iPhone)
      return true;
    });

  // Cuota inicial de la principal (monto a cubrir por las co-financiaciones + efectivo)
  let cuotaInicialPrincipal = 0;
  if (form.financiera === "KREDIYA" || form.financiera === "ADELANTOS") {
    cuotaInicialPrincipal = valorPctOficial;
  } else if (form.financiera === "+KUPO") {
    cuotaInicialPrincipal = inicialKupo;
  }

  // Tasas por co-financiera. BOGOTA = 0% (no cobra comisión, solo registra cupo).
  const COF_TASAS: Record<string, number> = { ADDI: 0.04165, "SU+PAY": 0.019, ALCANOS: 0.05, BOGOTA: 0 };

  // Calcular por cada cof en el array. Ninguna co-financiera es "kredit-cuota"
  // (las 3 que lo son están excluidas por regla). Solo distinguimos si cobra
  // comisión (tasa > 0) o no (BOGOTA).
  const cofsCalculados = coFinanciaciones.map((c) => {
    const monto = Number(c.monto) || 0;
    const tasa = COF_TASAS[c.financiera] ?? 0;
    const esComision = tasa > 0;
    const comisionEfectivo = esComision && monto > 0 ? Math.round(monto * tasa) : 0;
    const precioInflado = esComision && monto > 0 ? Math.round(monto / (1 - tasa)) : 0;
    const comisionFinanciada = precioInflado - monto;
    return { ...c, monto, tasa, esComision, comisionEfectivo, precioInflado, comisionFinanciada };
  });

  const sumaCofs = cofsCalculados.reduce((s, c) => s + c.monto, 0);
  const faltanteParaCuota = Math.max(0, cuotaInicialPrincipal - sumaCofs);
  // Validaciones del array de co-financiaciones
  let cofError = "";
  for (let i = 0; i < cofsCalculados.length; i++) {
    const c = cofsCalculados[i];
    if (!c.financiera) { cofError = `Co-financiera #${i + 1}: elige la financiera`; break; }
    if (c.monto <= 0) { cofError = `Co-financiera #${i + 1} (${c.financiera}): ingresa el monto que cubre`; break; }
    if (c.esComision && !c.modoComision) {
      cofError = `${c.financiera} cobra ${(c.tasa * 100).toFixed(3).replace(/\.?0+$/, "")}%. Elige cómo paga el cliente esa comisión (efectivo o dentro).`;
      break;
    }
  }
  if (!cofError && cofsCalculados.length > 0 && cuotaInicialPrincipal > 0 && sumaCofs > cuotaInicialPrincipal) {
    cofError = `La suma de las co-financiaciones ($${sumaCofs.toLocaleString("es-CO")}) supera la cuota inicial ($${cuotaInicialPrincipal.toLocaleString("es-CO")}). Ajusta los montos.`;
  }
  const cofInvalido = !!cofError;

  async function confirmar() {
    if (!form.financiera) {
      setEstado({ tipo: "error", mensaje: "Selecciona la financiera" });
      return;
    }
    if (!valorTotalNum || valorTotalNum <= 0) {
      setEstado({ tipo: "error", mensaje: "Ingresa el valor total" });
      return;
    }
    if (esContado && restante !== 0) {
      setEstado({
        tipo: "error",
        mensaje: `En venta de Contado la suma de medios de pago debe cuadrar exacto con el total. Faltan $${restante.toLocaleString("es-CO")}.`,
      });
      return;
    }
    // Validación de co-financiación (si está activa)
    if (cofInvalido) {
      setEstado({ tipo: "error", mensaje: cofError });
      return;
    }
    if (esKupoIphone) {
      if (pctKupoNum < minPctKupo) {
        setEstado({
          tipo: "error",
          mensaje: `Porcentaje mínimo para este precio: ${minPctKupo}% (+Kupo financia máx $3.000.000)`,
        });
        return;
      }
      if (financiadoKupo > 3_000_000) {
        setEstado({
          tipo: "error",
          mensaje: `+Kupo financia máximo $3.000.000. Sube el porcentaje inicial.`,
        });
        return;
      }
    } else if (esKrediyaOPayJoy || esKupoAndroid) {
      if (esKrediyaOPayJoy && !pctNum) {
        setEstado({
          tipo: "error",
          mensaje: "Selecciona el % inicial que quedó con la financiera",
        });
        return;
      }
      if (!valorRecibirNum || valorRecibirNum <= 0) {
        setEstado({
          tipo: "error",
          mensaje:
            "Ingresa el valor a recibir (cuota inicial real que paga el cliente)",
        });
        return;
      }
      if (diferenciaMedios !== 0) {
        setEstado({
          tipo: "error",
          mensaje:
            diferenciaMedios > 0
              ? `Faltan $${diferenciaMedios.toLocaleString("es-CO")} por desglosar en los medios de pago.`
              : `Los medios de pago se pasan por ${Math.abs(diferenciaMedios).toLocaleString("es-CO")}.`,
        });
        return;
      }
    } else if (esAddi) {
      if (!form.pagoComisionAddi) {
        setEstado({ tipo: "error", mensaje: "Selecciona cómo paga el cliente la comisión ADDI" });
        return;
      }
      if (form.pagoComisionAddi === "efectivo" && diferenciaAddi !== 0) {
        setEstado({ tipo: "error", mensaje: diferenciaAddi > 0 ? `Faltan ${diferenciaAddi.toLocaleString("es-CO")} en medios de pago (comisión ADDI en efectivo).` : `Los medios se pasan por ${Math.abs(diferenciaAddi).toLocaleString("es-CO")}.` });
        return;
      }
    } else if (esRenting) {
      if (pctRentingNum < minPctRenting) {
        setEstado({ tipo: "error", mensaje: `Porcentaje mínimo para este precio: ${minPctRenting}% (Renting financia máx $3.000.000)` });
        return;
      }
      if (financiadoRenting > 3_000_000) {
        setEstado({ tipo: "error", mensaje: `El monto financiado (${financiadoRenting.toLocaleString("es-CO")}) supera $3.000.000. Por favor aumente el inicial.` });
        return;
      }
    } else if (esSupay) {
      if (!form.pagoComisionSupay) {
        setEstado({ tipo: "error", mensaje: "Selecciona cómo paga el cliente la comisión SU+PAY" });
        return;
      }
      if (form.pagoComisionSupay === "efectivo" && diferenciaSupay !== 0) {
        setEstado({ tipo: "error", mensaje: `Falta ${diferenciaSupay.toLocaleString("es-CO")} para cubrir la comisión SU+PAY` });
        return;
      }
    } else if (esAlcanos) {
      if (!form.pagoComisionAlcanos) {
        setEstado({ tipo: "error", mensaje: "Selecciona como paga el cliente la comision ALCANOS" });
        return;
      }
      if (diferenciaAlcanos !== 0) {
        setEstado({ tipo: "error", mensaje: `Falta ${diferenciaAlcanos.toLocaleString("es-CO")} para cubrir la comision ALCANOS` });
        return;
      }
    }

    // Convertir selección del asesor a pagos numéricos > 0
    const pagosArray = seleccionados
      .map((s) => ({ medio: s.medio, valor: Number(s.valor) || 0 }))
      .filter((p) => p.valor > 0);
    if (
      pagosArray.length === 0 &&
      !(esAddi && form.pagoComisionAddi === "addi") &&
      !(esSupay && form.pagoComisionSupay === "supay") &&
      !(esAlcanos && form.pagoComisionAlcanos === "alcanos")
    ) {
      setEstado({
        tipo: "error",
        mensaje:
          "Agrega al menos un medio de pago con valor. Usa '+ Agregar medio'.",
      });
      return;
    }

    setEstado({ tipo: "guardando" });
    try {
      const r = await fetch("/api/venta/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedula,
          imei,
          filaInventario: filaInv,
          financiera: form.financiera,
          valorTotal: valorTotalNum,
          porcentajeCuota: form.porcentajeCuota ? Number(form.porcentajeCuota) : undefined,
          porcentajeKupo: esKupoIphone ? pctKupoNum : undefined,
          inicialKupo: esKupoIphone ? inicialKupo : undefined,
          porcentajeRenting: esRenting ? pctRentingNum : undefined,
          inicialRenting: esRenting ? inicialRenting : undefined,
          valorRecibir: form.valorRecibir ? Number(form.valorRecibir) : undefined,
          pagos: pagosArray,
          observaciones: form.observaciones || undefined,
            pagoComisionAddi: esAddi ? form.pagoComisionAddi : undefined,
            comisionAddi: esAddi ? (form.pagoComisionAddi === "efectivo" ? comisionAddiEfectivo : comisionAddiFinanciada) : undefined,
            precioAddi: esAddi && form.pagoComisionAddi === "addi" ? precioAddiFinanciado : undefined,
            pagoComisionSupay: esSupay ? form.pagoComisionSupay : undefined,
            comisionSupay: esSupay ? comisionSupayEfectivo : undefined,
            precioSupay: esSupay && form.pagoComisionSupay === "supay" ? precioSupayFinanciado : undefined,
            pagoComisionAlcanos: esAlcanos ? form.pagoComisionAlcanos : undefined,
            comisionAlcanos: esAlcanos ? comisionAlcanosEfectivo : undefined,
            precioAlcanos: esAlcanos && form.pagoComisionAlcanos === "alcanos" ? precioAlcanosFinanciado : undefined,
            // Co-financiaciones: array de N financieras que cubren partes de la cuota inicial.
            coFinanciaciones: cofsCalculados
              .filter((c) => c.financiera && c.monto > 0)
              .map((c) => ({
                financiera: c.financiera,
                valor: c.monto,
                modoComision: c.esComision ? c.modoComision : undefined,
                comisionValor: c.esComision
                  ? (c.modoComision === "efectivo" ? c.comisionEfectivo : c.comisionFinanciada)
                  : undefined,
                precioInflado: c.esComision && c.modoComision === "dentro" ? c.precioInflado : undefined,
              })),
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setEstado({ tipo: "error", mensaje: data.error || "Error al guardar" });
        return;
      }
      setEstado({ tipo: "ok", filaVenta: data.filaVenta });
    } catch (e: any) {
      setEstado({ tipo: "error", mensaje: e?.message || "Error de red" });
    }
  }

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando sesión...</p>
      </main>
    );
  }

  if (estado.tipo === "cargando") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando producto...</p>
      </main>
    );
  }

  if (estado.tipo === "error" && !producto) {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto">
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm mb-4">
          <strong>Error:</strong> {estado.mensaje}
        </div>
        <button
          onClick={() => router.push("/venta/paso1")}
          className="px-4 py-2 bg-[#141821] border border-[#2a2f3b] text-white rounded-lg"
        >
          ← Volver al Paso 1
        </button>
      </main>
    );
  }

  // Pantalla de éxito
  if (estado.tipo === "ok") {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto">
        <div className="bg-[#141821] border border-green-800 rounded-xl p-6 mb-6">
          <div className="text-green-400 text-xs mb-2">✓ VENTA GUARDADA</div>
          <h1 className="text-2xl font-bold mb-4">
            Fila {estado.filaVenta} en hoja Ventas 2026
          </h1>
          {cliente && producto && (
            <div className="text-sm text-muted space-y-1 mb-4">
              <div>Cliente: <span className="text-white">{cliente.nombre}</span></div>
              <div>Equipo: <span className="text-white">{producto.marca} {producto.equipo}</span></div>
              <div>IMEI: <span className="text-white font-mono">{producto.imei}</span></div>
              <div>Financiera: <span className="text-white">{form.financiera}</span></div>
              <div>Valor: <span className="text-white">${valorTotalNum.toLocaleString("es-CO")}</span></div>
            </div>
          )}
          <p className="text-muted text-xs">
            El equipo quedó marcado como VENDIDO en el inventario. El detalle del
            pago quedó registrado fila por fila en la hoja DETALLE_PAGOS.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex-1 py-3 bg-[#141821] border border-[#2a2f3b] text-white rounded-lg"
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push("/venta/paso1")}
            className="flex-1 py-3 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-lg"
          >
            Nueva venta
          </button>
        </div>
      </main>
    );
  }

  // Pantalla principal del formulario
  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/venta/paso2?cedula=${cedula}`)}
          className="text-muted text-sm hover:text-white"
        >
          ← Paso 2
        </button>
        <div className="text-muted text-xs">CC: {cedula}</div>
      </div>

      <h1 className="text-2xl font-bold mb-1">Paso 3 · Pago</h1>
      <p className="text-muted text-sm mb-6">
        Financiera, valor, y desglose del pago.
      </p>

      {/* Resumen cliente + producto */}
      {cliente && producto && (
        <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4 mb-6 text-sm space-y-1">
          <div className="text-xs text-muted">CLIENTE</div>
          <div className="font-medium">{cliente.nombre}</div>
          <div className="text-muted mb-3">CC {cliente.cedula}{cliente.telefono ? ` · Tel ${cliente.telefono}` : ""}</div>
          <div className="text-xs text-muted">PRODUCTO</div>
          <div className="font-medium">
            {producto.marca} · {producto.equipo}
            {producto.color && ` · ${producto.color}`}
          </div>
          <div className="font-mono text-xs text-muted">IMEI {producto.imei}</div>
        </div>
      )}

      <div className="space-y-3">
        {/* Financiera */}
        <div>
          <label className="block text-xs text-muted mb-1">Financiera *</label>
          <select
            value={form.financiera}
            onChange={(e) => setForm(f => ({ ...f, financiera: e.target.value, pagoComisionAddi: "", pagoComisionSupay: "", pagoComisionAlcanos: "", porcentajeRenting: "", cuotaRenting: "" }))}
            className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
          >
            <option value="">-- Seleccionar --</option>
            {sedeInfo?.financieras.filter((f) => {
              // Solo KREDIYA, +KUPO, ADELANTOS, RENTING (si iPhone) y Contado
              // pueden ser financiera PRINCIPAL. El resto (BOGOTA/ADDI/SU+PAY/ALCANOS)
              // solo puede aparecer como co-financiera.
              const validasPrincipal = ["KREDIYA", "+KUPO", "ADELANTOS", "RENTING", "Contado"];
              if (!validasPrincipal.includes(f)) return false;
              if (f === "RENTING" && !esIphone) return false;
              return true;
            }).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* Valor total */}
        <Numero
          label="Valor total de la venta *"
          value={form.valorTotal}
          onChange={(v) => actualizar("valorTotal", v)}
          placeholder="1.500.000"
        />

        {/* +KUPO con iPhone: flujo especial de porcentaje */}
        {esKupoIphone && (
          <div className="bg-[#0b0d12] border border-orange-900/60 rounded-lg p-3 space-y-3">
            <div className="text-xs text-brand font-bold uppercase tracking-wider">
              +Kupo · iPhone — Flujo especial
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-muted">% de cuota inicial</label>
                <span className="text-brand font-bold">{Number.isInteger(pctKupoReal) ? pctKupoReal : pctKupoReal.toFixed(2)}%</span>
              </div>
              <input
                type="range"
                min={minPctKupo}
                max={80}
                step={1}
                value={Math.round(pctKupoReal)}
                onChange={(e) => { actualizar("porcentajeKupo", e.target.value); actualizar("cuotaKupo", ""); }}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>Mín {minPctKupo}%</span>
                <span>80%</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">O ingresa la cuota inicial ($)</label>
              <input
                type="number"
                min={0}
                value={form.cuotaKupo !== "" ? form.cuotaKupo : (inicialKupo > 0 ? String(inicialKupo) : "")}
                onChange={(e) => actualizar("cuotaKupo", e.target.value)}
                className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
                placeholder="Ej: 500.000"
              />
            </div>
            <div className="border-t border-[#2a2f3b] pt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Credicell recibe (inicial):</span>
                <span className="font-bold text-white">${inicialKupo.toLocaleString("es-CO")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">+Kupo financia:</span>
                <span className={`font-bold ${financiadoKupo > 3_000_000 ? "text-red-400" : "text-white"}`}>
                  ${financiadoKupo.toLocaleString("es-CO")}
                </span>
              </div>
              {financiadoKupo > 3_000_000 ? (
                <p className="text-red-400 text-xs">
                  +Kupo financia máximo $3.000.000. Sube el porcentaje.
                </p>
              ) : (
                <p className="text-green-400 text-xs">Financiación válida</p>
              )}
            </div>
            <p className="text-xs text-muted">
              Agrega medios de pago abajo que sumen el inicial (${inicialKupo.toLocaleString("es-CO")}).
            </p>
          </div>
        )}

        {esRenting && (
          <div className="bg-[#0b0d12] border border-orange-900/60 rounded-lg p-3 space-y-3">
            <div className="text-xs text-brand font-bold uppercase tracking-wider">
              Renting · iPhone — Flujo especial
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-muted">% de cuota inicial</label>
                <span className="text-brand font-bold">{Number.isInteger(pctKupoReal) ? pctKupoReal : pctKupoReal.toFixed(2)}%</span>
              </div>
              <input
                type="range"
                min={minPctRenting}
                max={80}
                step={1}
                value={Math.round(pctKupoReal)}
                onChange={(e) => { actualizar("porcentajeRenting", e.target.value); actualizar("cuotaRenting", ""); }}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>Mín {minPctRenting}%</span>
                <span>80%</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">O ingresa la cuota inicial ($)</label>
              <input
                type="number"
                min={0}
                value={form.cuotaRenting !== "" ? form.cuotaRenting : (inicialRenting > 0 ? String(inicialRenting) : "")}
                onChange={(e) => actualizar("cuotaRenting", e.target.value)}
                className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
                placeholder="Ej: 500.000"
              />
            </div>
            <div className="border-t border-[#2a2f3b] pt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Credicell recibe (inicial):</span>
                <span className="font-bold text-white">${inicialRenting.toLocaleString("es-CO")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Renting financia:</span>
                <span className={`font-bold ${financiadoRenting > 3_000_000 ? "text-red-400" : "text-white"}`}>
                  ${financiadoRenting.toLocaleString("es-CO")}
                </span>
              </div>
              {financiadoRenting > 3_000_000 ? (
                <p className="text-red-400 text-xs">
                  Renting financia máximo $3.000.000. Sube el porcentaje.
                </p>
              ) : (
                <p className="text-green-400 text-xs">Financiación válida</p>
              )}
            </div>
            <p className="text-xs text-muted">
              Agrega medios de pago abajo que sumen el inicial (${inicialRenting.toLocaleString("es-CO")}).
            </p>
          </div>
        )}

        {/* +KUPO con Android/otro */}
        {esKupoAndroid && (
          <div className="bg-[#0b0d12] border border-orange-900/60 rounded-lg p-3 space-y-3">
            <div className="text-xs text-brand font-bold uppercase tracking-wider">
              +Kupo · Android / Otro
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">
                % inicial (la que quedó con la financiera)
              </label>
              <select value={form.porcentajeKupo}
                onChange={(e) => { actualizar("porcentajeKupo", e.target.value); actualizar("cuotaKupo", ""); }}
                className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
              >
                <option value="">-- Seleccionar --</option>
                {[20, 25, 30, 35, 40, 45, 50].map((p) => (
                  <option key={p} value={p}>{p}%</option>
                ))}
              </select>
            </div>
            {precioKupo > 0 && (
              <div className="text-xs bg-[#141821] border border-[#2a2f3b] rounded p-2">
                <div className="flex justify-between">
                  <span className="text-muted">
                    Cuota {Number.isInteger(pctKupoReal) ? pctKupoReal : pctKupoReal.toFixed(2)}% calculada:
                  </span>
                  <span className="text-white font-mono">
                    ${inicialKupo.toLocaleString("es-CO")}
                  </span>
                </div>
                <div className="text-[10px] text-muted mt-1">
                  Lo que +Kupo espera que cobres según el porcentaje.
                </div>
              </div>
            )}
            <Numero
              label="Valor a recibir (cuota inicial real que paga el cliente) *"
              value={form.valorRecibir}
              onChange={(v) => actualizar("valorRecibir", v)}
              placeholder={inicialKupo > 0 ? String(inicialKupo) : "ej: 500.000"}
            />
            {valorRecibirNum > 0 && inicialKupo > 0 && (
              <div className="text-xs bg-[#141821] border border-[#2a2f3b] rounded p-2 flex justify-between">
                <span className="text-muted">
                  {inicialKupo - valorRecibirNum > 0 ? "Descuento al cliente:" : inicialKupo - valorRecibirNum < 0 ? "Pagó de más:" : "Sin descuento:"}
                </span>
                <span className={
                  inicialKupo === valorRecibirNum ? "text-green-400 font-mono" :
                  inicialKupo > valorRecibirNum ? "text-yellow-400 font-mono" :
                  "text-blue-400 font-mono"
                }>
                  ${Math.abs(inicialKupo - valorRecibirNum).toLocaleString("es-CO")}
                </span>
              </div>
            )}
            {precioKupo > 0 && valorRecibirNum > 0 && (
              <div className="border-t border-[#2a2f3b] pt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">+Kupo financia:</span>
                  <span className={`font-bold ${(precioKupo - valorRecibirNum) > 3_000_000 ? "text-red-400" : "text-white"}`}>
                    ${(precioKupo - valorRecibirNum).toLocaleString("es-CO")}
                  </span>
                </div>
                {(precioKupo - valorRecibirNum) > 3_000_000 ? (
                  <p className="text-red-400 text-xs">+Kupo financia máximo $3.000.000. Aumenta el valor a recibir.</p>
                ) : (
                  <p className="text-green-400 text-xs">Financiación válida</p>
                )}
              </div>
            )}
          </div>
        )}

        {esKrediyaOPayJoy && (
          <div className="bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3 space-y-3">
            <div className="text-xs text-muted font-medium">
              Datos de la financiera ({form.financiera})
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">
                % inicial (la que quedó con la financiera)
              </label>
              <select
                value={form.porcentajeCuota}
                onChange={(e) => actualizar("porcentajeCuota", e.target.value)}
                className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
              >
                <option value="">-- Seleccionar --</option>
                {[20, 25, 30, 35, 40, 45, 50].map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </div>
            {pctNum > 0 && valorTotalNum > 0 && (
              <div className="text-xs bg-[#141821] border border-[#2a2f3b] rounded p-2">
                <div className="flex justify-between">
                  <span className="text-muted">
                    Valor {pctNum}% oficial:
                  </span>
                  <span className="text-white font-mono">
                    ${valorPctOficial.toLocaleString("es-CO")}
                  </span>
                </div>
                <div className="text-[10px] text-muted mt-1">
                  Lo que oficialmente la financiera espera que cobres al cliente.
                </div>
              </div>
            )}
            <Numero
              label="Valor a recibir (cuota inicial real que paga el cliente) *"
              value={form.valorRecibir}
              onChange={(v) => actualizar("valorRecibir", v)}
              placeholder={valorPctOficial ? String(valorPctOficial) : "ej: 400.000"}
            />
            {valorRecibirNum > 0 && valorPctOficial > 0 && (
              <div className="text-xs bg-[#141821] border border-[#2a2f3b] rounded p-2 flex justify-between">
                <span className="text-muted">
                  {descuentoFinanciera > 0
                    ? "Descuento al cliente:"
                    : descuentoFinanciera < 0
                      ? "Pagó de más:"
                      : "Sin descuento:"}
                </span>
                <span
                  className={
                    descuentoFinanciera === 0
                      ? "text-green-400 font-mono"
                      : descuentoFinanciera > 0
                        ? "text-yellow-400 font-mono"
                        : "text-blue-400 font-mono"
                  }
                >
                  ${Math.abs(descuentoFinanciera).toLocaleString("es-CO")}
                </span>
              </div>
            )}
          </div>
        )}

        {esAddi && (
          <div className="bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3 space-y-3">
            <div className="text-xs text-brand font-bold uppercase tracking-wider">
              ADDI — Comisión financiera
            </div>
            <div className="text-xs bg-[#141821] border border-[#2a2f3b] rounded p-2">
              <div className="flex justify-between text-muted">
                <span>Tasa ADDI (3.5% + 19% IVA):</span>
                <span className="text-white font-mono">4.165%</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-2">
                ¿Cómo paga el cliente la comisión?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => actualizar("pagoComisionAddi", "efectivo")}
                  className={`py-2 px-3 rounded-lg text-sm border ${form.pagoComisionAddi === "efectivo" ? "bg-brand text-[#0b0d12] border-brand font-bold" : "bg-[#141821] text-white border-[#2a2f3b]"}`}
                >
                  En efectivo
                </button>
                <button type="button"
                  onClick={() => actualizar("pagoComisionAddi", "addi")}
                  className={`py-2 px-3 rounded-lg text-sm border ${form.pagoComisionAddi === "addi" ? "bg-brand text-[#0b0d12] border-brand font-bold" : "bg-[#141821] text-white border-[#2a2f3b]"}`}
                >
                  Dentro de ADDI
                </button>
              </div>
            </div>
            {form.pagoComisionAddi === "efectivo" && valorTotalNum > 0 && (
              <div className="bg-[#141821] border border-[#2a2f3b] rounded p-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Valor a registrar en ADDI:</span>
                  <span className="text-white font-mono">${valorTotalNum.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Comisión en efectivo:</span>
                  <span className="text-yellow-400 font-mono font-bold">${comisionAddiEfectivo.toLocaleString("es-CO")}</span>
                </div>
                <p className="text-[10px] text-muted pt-1 border-t border-[#2a2f3b]">
                  Agrega ${comisionAddiEfectivo.toLocaleString("es-CO")} en efectivo en el desglose de abajo.
                </p>
              </div>
            )}
            {form.pagoComisionAddi === "addi" && valorTotalNum > 0 && (
              <div className="bg-[#141821] border border-[#2a2f3b] rounded p-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Precio a ingresar en ADDI:</span>
                  <span className="text-brand font-mono font-bold">${precioAddiFinanciado.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Comisión incluida:</span>
                  <span className="text-yellow-400 font-mono">${comisionAddiFinanciada.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Tienda recibe neto:</span>
                  <span className="text-green-400 font-mono">${valorTotalNum.toLocaleString("es-CO")}</span>
                </div>
                <p className="text-[10px] text-muted pt-1 border-t border-[#2a2f3b]">
                  Ingresa ${precioAddiFinanciado.toLocaleString("es-CO")} en la app ADDI. El cliente no paga efectivo.
                </p>
              </div>
            )}
          </div>
        )}
        {esSupay && (
          <div className="bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3 space-y-3">
            <div className="text-xs text-brand font-bold uppercase tracking-wider">
              SU+PAY — Comisión financiera
            </div>
            <div className="text-xs bg-[#141821] border border-[#2a2f3b] rounded p-2">
              <div className="flex justify-between text-muted">
                <span>Tasa SU+PAY (1.9%):</span>
                <span className="text-white font-mono">1.9%</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-2">
                ¿Cómo paga el cliente la comisión?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => actualizar("pagoComisionSupay", "efectivo")}
                  className={`py-2 px-3 rounded-lg text-sm border ${form.pagoComisionSupay === "efectivo" ? "bg-brand text-[#0b0d12] border-brand font-bold" : "bg-[#141821] text-white border-[#2a2f3b]"}`}
                >
                  En efectivo
                </button>
                <button type="button"
                  onClick={() => actualizar("pagoComisionSupay", "supay")}
                  className={`py-2 px-3 rounded-lg text-sm border ${form.pagoComisionSupay === "supay" ? "bg-brand text-[#0b0d12] border-brand font-bold" : "bg-[#141821] text-white border-[#2a2f3b]"}`}
                >
                  Dentro de SU+PAY
                </button>
              </div>
            </div>
            {form.pagoComisionSupay === "efectivo" && valorTotalNum > 0 && (
              <div className="bg-[#141821] border border-[#2a2f3b] rounded p-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Valor a registrar en SU+PAY:</span>
                  <span className="text-white font-mono">${valorTotalNum.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Comisión en efectivo:</span>
                  <span className="text-yellow-400 font-mono font-bold">${comisionSupayEfectivo.toLocaleString("es-CO")}</span>
                </div>
                <p className="text-[10px] text-muted pt-1 border-t border-[#2a2f3b]">
                  Agrega ${comisionSupayEfectivo.toLocaleString("es-CO")} en efectivo en el desglose de abajo.
                </p>
              </div>
            )}
            {form.pagoComisionSupay === "supay" && valorTotalNum > 0 && (
              <div className="bg-[#141821] border border-[#2a2f3b] rounded p-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Precio a ingresar en SU+PAY:</span>
                  <span className="text-brand font-mono font-bold">${precioSupayFinanciado.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Comisión incluida:</span>
                  <span className="text-yellow-400 font-mono">${comisionSupayFinanciada.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Tienda recibe neto:</span>
                  <span className="text-green-400 font-mono">${valorTotalNum.toLocaleString("es-CO")}</span>
                </div>
                <p className="text-[10px] text-muted pt-1 border-t border-[#2a2f3b]">
                  Ingresa ${precioSupayFinanciado.toLocaleString("es-CO")} en SU+PAY. El cliente no paga efectivo.
                </p>
              </div>
            )}
          </div>
        )}

        {esAlcanos && (
          <div className="bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3 space-y-3">
            <div className="text-xs text-brand font-bold uppercase tracking-wider">
              ALCANOS — Comisión financiera
            </div>
            <div className="text-xs bg-[#141821] border border-[#2a2f3b] rounded p-2">
              <div className="flex justify-between text-muted">
                <span>Tasa ALCANOS:</span>
                <span className="text-white font-mono">5%</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-2">
                ¿Cómo paga el cliente la comisión?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => actualizar("pagoComisionAlcanos", "efectivo")}
                  className={`py-2 px-3 rounded-lg text-sm border ${form.pagoComisionAlcanos === "efectivo" ? "bg-brand text-[#0b0d12] border-brand font-bold" : "bg-[#141821] text-white border-[#2a2f3b]"}`}
                >
                  En efectivo
                </button>
                <button type="button"
                  onClick={() => actualizar("pagoComisionAlcanos", "alcanos")}
                  className={`py-2 px-3 rounded-lg text-sm border ${form.pagoComisionAlcanos === "alcanos" ? "bg-brand text-[#0b0d12] border-brand font-bold" : "bg-[#141821] text-white border-[#2a2f3b]"}`}
                >
                  Dentro de ALCANOS
                </button>
              </div>
            </div>
            {form.pagoComisionAlcanos === "efectivo" && valorTotalNum > 0 && (
              <div className="bg-[#141821] border border-[#2a2f3b] rounded p-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Valor a registrar en ALCANOS:</span>
                  <span className="text-white font-mono">${valorTotalNum.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Comisión en efectivo:</span>
                  <span className="text-yellow-400 font-mono font-bold">${comisionAlcanosEfectivo.toLocaleString("es-CO")}</span>
                </div>
                <p className="text-[10px] text-muted pt-1 border-t border-[#2a2f3b]">
                  Agrega ${comisionAlcanosEfectivo.toLocaleString("es-CO")} en efectivo en el desglose de abajo.
                </p>
              </div>
            )}
            {form.pagoComisionAlcanos === "alcanos" && valorTotalNum > 0 && (
              <div className="bg-[#141821] border border-[#2a2f3b] rounded p-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Precio a ingresar en ALCANOS:</span>
                  <span className="text-brand font-mono font-bold">${precioAlcanosFinanciado.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Comisión incluida:</span>
                  <span className="text-yellow-400 font-mono">${comisionAlcanosFinanciada.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Tienda recibe neto:</span>
                  <span className="text-green-400 font-mono">${valorTotalNum.toLocaleString("es-CO")}</span>
                </div>
                <p className="text-[10px] text-muted pt-1 border-t border-[#2a2f3b]">
                  Ingresa ${precioAlcanosFinanciado.toLocaleString("es-CO")} en ALCANOS. El cliente no paga efectivo.
                </p>
              </div>
            )}
          </div>
        )}
        <div className="pt-2 border-t border-[#2a2f3b] mt-4">
          <p className="text-xs text-muted mb-2 font-medium">
            Desglose del pago por medio
            {esContado
              ? " — debe sumar el valor total"
              : esKrediyaOPayJoy
                ? " — debe sumar el valor a recibir (cuota inicial real)"
                : esKupoIphone
                  ? ` — debe sumar el inicial (${inicialKupo.toLocaleString("es-CO")})`
                  : esKupoAndroid
                  ? " — debe sumar el valor a recibir (cuota inicial real)"
                  : " — lo que pagó el cliente hoy"}
          </p>
          {/* UX: el asesor CONSTRUYE el desglose agregando medios uno
              por uno. Evita el ruido visual de mostrar todos los medios
              cuando típicamente solo se usa 1-2. Admins pueden crear
              medios nuevos inline sin salir del Paso 3.
              CAJA queda excluido del selector — es un saldo físico de la
              sede, no un medio de pago que el cliente use. */}
          {seleccionados.length === 0 && !mostrarSelector && (
            <p className="text-xs text-muted italic mb-3">
              Aún no has agregado medios. Presiona "+ Agregar medio" para empezar.
            </p>
          )}

          <div className="space-y-2 mb-3">
            {seleccionados.map((s) => (
              <div
                key={s.medio}
                className="flex items-center gap-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-2"
              >
                <div className="w-24 text-xs text-muted shrink-0 pl-1">
                  {formatearNombreMedio(s.medio)}
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  value={s.valor}
                  onChange={(e) => setValorMedio(s.medio, e.target.value)}
                  placeholder="0"
                  className="flex-1 px-2 py-1.5 bg-[#141821] border border-[#2a2f3b] rounded text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm"
                />
                <button
                  type="button"
                  onClick={() => quitarMedio(s.medio)}
                  aria-label={`Quitar ${s.medio}`}
                  className="w-7 h-7 text-muted hover:text-red-400 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {!mostrarSelector && (
            <button
              type="button"
              onClick={() => {
                setMostrarSelector(true);
                setCreandoNuevo(false);
              }}
              className="w-full py-2 px-3 bg-[#141821] hover:bg-[#1e242f] border border-dashed border-[#2a2f3b] text-muted hover:text-white rounded-lg text-sm"
            >
              + Agregar medio
            </button>
          )}

          {mostrarSelector && (
            <div className="bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted font-medium">Elige un medio</p>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarSelector(false);
                    setCreandoNuevo(false);
                    setErrorNuevo("");
                  }}
                  className="text-xs text-muted hover:text-white"
                >
                  cancelar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {medios
                  .filter(
                    (m) =>
                      m.activo &&
                      m.nombre !== "CAJA" &&
                      m.nombre !== "OTRO" &&
                      !seleccionados.some((s) => s.medio === m.nombre)
                  )
                  .map((m) => (
                    <button
                      key={m.nombre}
                      type="button"
                      onClick={() => agregarMedio(m.nombre)}
                      className="py-2 px-3 bg-[#141821] hover:bg-brand hover:text-[#0b0d12] border border-[#2a2f3b] text-white rounded text-sm text-left"
                    >
                      {formatearNombreMedio(m.nombre)}
                    </button>
                  ))}
              </div>

              {/* Admin puede crear un medio nuevo sin salir del Paso 3.
                  Se agrega al catálogo y se selecciona automáticamente
                  para esta venta. */}
              {esAdmin && !creandoNuevo && (
                <button
                  type="button"
                  onClick={() => {
                    setCreandoNuevo(true);
                    setErrorNuevo("");
                  }}
                  className="w-full mt-3 py-2 px-3 bg-[#141821] hover:bg-[#1e242f] border border-dashed border-brand text-brand hover:text-brand-light rounded text-sm"
                >
                  + Crear medio nuevo
                </button>
              )}

              {esAdmin && creandoNuevo && (
                <div className="mt-3 pt-3 border-t border-[#2a2f3b] space-y-2">
                  <p className="text-xs text-muted">
                    Nuevo medio (quedará en el catálogo y disponible para
                    todas las ventas)
                  </p>
                  <input
                    type="text"
                    value={nuevoMedioNombre}
                    onChange={(e) => setNuevoMedioNombre(e.target.value)}
                    placeholder="Ej: DAVIPLATA"
                    className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm uppercase"
                  />
                  {errorNuevo && (
                    <p className="text-xs text-red-400">{errorNuevo}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={crearNuevoMedio}
                      disabled={guardandoNuevo || !nuevoMedioNombre.trim()}
                      className="flex-1 py-2 px-3 bg-brand hover:bg-brand-light disabled:opacity-40 text-[#0b0d12] font-bold rounded text-sm"
                    >
                      {guardandoNuevo ? "Guardando..." : "Guardar y usar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreandoNuevo(false);
                        setNuevoMedioNombre("");
                        setErrorNuevo("");
                      }}
                      className="px-3 py-2 bg-[#141821] border border-[#2a2f3b] text-muted hover:text-white rounded text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {valorTotalNum > 0 && (
            <div className="mt-3 p-3 bg-[#0b0d12] border border-[#2a2f3b] rounded text-xs space-y-1">
              <div className="flex justify-between text-muted">
                <span>Valor venta:</span>
                <span className="text-white font-mono">${valorTotalNum.toLocaleString("es-CO")}</span>
              </div>

              {esKrediyaOPayJoy && pctNum > 0 && (
                <>
                  <div className="flex justify-between text-muted">
                    <span>Valor {pctNum}% oficial:</span>
                    <span className="text-white font-mono">${valorPctOficial.toLocaleString("es-CO")}</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Valor a recibir (inicial real):</span>
                    <span className="text-white font-mono">${valorRecibirNum.toLocaleString("es-CO")}</span>
                  </div>
                </>
              )}
              {esKupoAndroid && valorRecibirNum > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Valor a recibir (inicial real):</span>
                  <span className="text-white font-mono">${valorRecibirNum.toLocaleString("es-CO")}</span>
                </div>
              )}

            {esAddi && form.pagoComisionAddi === "efectivo" && comisionAddiEfectivo > 0 && (
              <>
                <div className="flex justify-between text-muted">
                  <span>Valor en ADDI:</span>
                  <span className="text-white font-mono">${valorTotalNum.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Comisión efectivo:</span>
                  <span className="text-yellow-400 font-mono">${comisionAddiEfectivo.toLocaleString("es-CO")}</span>
                </div>
              </>
            )}
            {esAddi && form.pagoComisionAddi === "addi" && precioAddiFinanciado > 0 && (
              <>
                <div className="flex justify-between text-muted">
                  <span>Precio en ADDI:</span>
                  <span className="text-brand font-mono">${precioAddiFinanciado.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Comisión incluida:</span>
                  <span className="text-yellow-400 font-mono">${comisionAddiFinanciada.toLocaleString("es-CO")}</span>
                </div>
              </>
            )}
              <div className="flex justify-between text-muted">
                <span>Suma medios de pago:</span>
                <span className="text-white font-mono">${pagadoNum.toLocaleString("es-CO")}</span>
              </div>

              {esContado && (
                <div className="flex justify-between font-medium pt-1 border-t border-[#2a2f3b]">
                  <span>Restante:</span>
                  <span className={restante === 0 ? "text-green-400" : restante > 0 ? "text-yellow-400" : "text-red-400"}>
                    ${restante.toLocaleString("es-CO")}
                  </span>
                </div>
              )}

              {(esKrediyaOPayJoy || esKupoAndroid) && valorRecibirNum > 0 && (
                <div className="flex justify-between font-medium pt-1 border-t border-[#2a2f3b]">
                  <span>Diferencia medios vs a recibir:</span>
                  <span
                    className={
                      diferenciaMedios === 0
                        ? "text-green-400 font-mono"
                        : diferenciaMedios > 0
                          ? "text-yellow-400 font-mono"
                          : "text-red-400 font-mono"
                    }
                  >
                    ${diferenciaMedios.toLocaleString("es-CO")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Observaciones</label>
          <textarea
            value={form.observaciones}
            onChange={(e) => actualizar("observaciones", e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
          />
        </div>

        {/* Co-financiaciones: array dinámico. Solo si la principal es de cuota inicial
            (KREDIYA/+KUPO/ADELANTOS) y hay monto de cuota inicial calculado. */}
        {principalEsCuotaInicial && cuotaInicialPrincipal > 0 && (
          <div className="border-t border-[#2a2f3b] pt-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Co-financiaciones (cubren la cuota inicial)</h3>
              <span className="text-xs text-muted">
                Cuota inicial de {form.financiera}: <span className="text-brand">${cuotaInicialPrincipal.toLocaleString("es-CO")}</span>
              </span>
            </div>
            <p className="text-xs text-muted mb-3">
              Si el cliente NO tiene efectivo para cubrir toda la cuota inicial, puede usar 1, 2 o más financieras.
              Lo que falte lo pondrá en medios de pago (Efectivo/Transferencia/etc).
            </p>

            {coFinanciaciones.map((cof, idx) => {
              const c = cofsCalculados[idx];
              return (
                <div key={idx} className="mb-3 border border-[#2a2f3b] rounded-lg p-3 bg-[#0b0d12]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted font-semibold">Co-financiera #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeCof(idx)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Quitar
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-muted mb-1">Financiera</label>
                      <select
                        value={cof.financiera}
                        onChange={(e) => updateCof(idx, "financiera", e.target.value)}
                        className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white text-sm"
                      >
                        <option value="">-- Elige --</option>
                        {financierasCoDisponibles
                          .filter((f) => !coFinanciaciones.some((cc, j) => j !== idx && cc.financiera === f))
                          .map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                      </select>
                    </div>

                    <Numero
                      label={`Cupo aprobado por ${cof.financiera || "esta financiera"} (de $${cuotaInicialPrincipal.toLocaleString("es-CO")} de cuota inicial)`}
                      value={cof.monto}
                      onChange={(v) => updateCof(idx, "monto", v)}
                      placeholder="Ej: 200000"
                    />

                    {c.esComision && c.monto > 0 && (
                      <div className="space-y-2 bg-[#141821] rounded-lg p-2">
                        <p className="text-xs text-white">
                          {cof.financiera} cobra <span className="text-brand">{(c.tasa * 100).toFixed(3).replace(/\.?0+$/, "")}%</span>
                          {" "}sobre ${c.monto.toLocaleString("es-CO")}.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateCof(idx, "modoComision", "efectivo")}
                            className={`flex-1 px-2 py-2 rounded-lg text-xs border ${
                              cof.modoComision === "efectivo"
                                ? "bg-brand text-[#0b0d12] border-brand font-bold"
                                : "bg-[#0b0d12] border-[#2a2f3b] text-white"
                            }`}
                          >
                            Efectivo (${c.comisionEfectivo.toLocaleString("es-CO")})
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCof(idx, "modoComision", "dentro")}
                            className={`flex-1 px-2 py-2 rounded-lg text-xs border ${
                              cof.modoComision === "dentro"
                                ? "bg-brand text-[#0b0d12] border-brand font-bold"
                                : "bg-[#0b0d12] border-[#2a2f3b] text-white"
                            }`}
                          >
                            Dentro (${c.precioInflado.toLocaleString("es-CO")})
                          </button>
                        </div>
                        {cof.modoComision === "efectivo" && (
                          <p className="text-xs text-yellow-300">
                            ⚠ Cliente paga ${c.comisionEfectivo.toLocaleString("es-CO")} adicionales en efectivo → Caja.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Resumen */}
            {coFinanciaciones.length > 0 && (
              <div className="text-xs bg-[#0b0d12] rounded-lg p-3 border border-[#2a2f3b] font-mono mb-2">
                <div className="flex justify-between">
                  <span className="text-muted">Suma co-financiaciones:</span>
                  <span className="text-white">${sumaCofs.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Cuota inicial {form.financiera}:</span>
                  <span className="text-white">${cuotaInicialPrincipal.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between border-t border-[#2a2f3b] mt-1 pt-1">
                  <span className="text-muted">{faltanteParaCuota > 0 ? "Falta en medios de pago:" : "Cuota cubierta ✓"}</span>
                  <span className={faltanteParaCuota > 0 ? "text-yellow-300" : "text-green-400"}>
                    ${faltanteParaCuota.toLocaleString("es-CO")}
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={addCof}
              disabled={financierasCoDisponibles.filter((f) => !coFinanciaciones.some((c) => c.financiera === f)).length === 0}
              className="w-full py-2 border border-dashed border-brand text-brand rounded-lg text-sm hover:bg-brand/10 disabled:opacity-40"
            >
              + Agregar otra co-financiera
            </button>

            {cofError && (
              <div className="text-xs text-red-400 mt-2">{cofError}</div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={confirmar}
        disabled={estado.tipo === "guardando" || (esAddi && !form.pagoComisionAddi) || (esAddi && form.pagoComisionAddi === "efectivo" && diferenciaAddi !== 0) || (esSupay && !form.pagoComisionSupay) || (esSupay && form.pagoComisionSupay === "efectivo" && diferenciaSupay !== 0) || (!esAddi && !esSupay && seleccionados.length > 0 && diferenciaMedios !== 0) || cofInvalido}
        className="w-full mt-6 py-4 bg-brand hover:bg-brand-light disabled:opacity-40 text-[#0b0d12] font-bold rounded-lg text-lg"
      >
        {estado.tipo === "guardando" ? "Guardando..." : "Confirmar venta"}
      </button>

      {estado.tipo === "error" && (
        <div className="mt-4 bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm">
          <strong>Error:</strong> {estado.mensaje}
        </div>
      )}
    </main>
  );
}

/**
 * Los medios del catálogo se almacenan en UPPERCASE por consistencia,
 * pero en la UI queremos mostrarlos más legibles: "DATAFONO" → "Datáfono",
 * "NEQUI" → "Nequi", etc. Mapeo manual corto — para medios que no estén
 * en el mapa, se muestra Capitalizado.
 */
function formatearNombreMedio(n: string): string {
  const map: Record<string, string> = {
    EFECTIVO: "Efectivo",
    TRANSFERENCIA: "Transferencia",
    NEQUI: "Nequi",
    DATAFONO: "Datáfono",
    WOMPI: "Wompi",
    OTRO: "Otro",
    DAVIPLATA: "Daviplata",
    "BRE-B": "Bre-B",
    PSE: "PSE",
  };
  if (map[n]) return map[n];
  return n.charAt(0) + n.slice(1).toLowerCase();
}

function Numero({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const num = Number(value) || 0;
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input
        type="tel"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm"
      />
      {num > 0 && (
        <p className="text-xs text-brand font-mono mt-1">
          = ${num.toLocaleString("es-CO")}
        </p>
      )}
    </div>
  );
}

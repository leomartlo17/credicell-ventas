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
    valorRecibir: "",
    observaciones: "",
  });

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
  const esKrediyaOPayJoy =
    form.financiera === "KREDIYA" || form.financiera === "PAYJOY";

  // +Kupo con iPhone: flujo especial con % de inicial
  const esKupoIphone =
    form.financiera === "+KUPO" && producto?.tipoEquipo?.toLowerCase() === "iphone";
  const esKupoAndroid =
    form.financiera === "+KUPO" && producto?.tipoEquipo?.toLowerCase() !== "iphone";
  const precioKupo = valorTotalNum || producto?.precioCosto || 0;
  const minPctKupo = precioKupo <= 3_000_000
    ? 20
    : Math.min(80, Math.max(20, Math.ceil(((precioKupo - 3_000_000) / precioKupo) * 100)));
  const pctKupoNum = Math.max(minPctKupo, Number(form.porcentajeKupo) || minPctKupo);
  const inicialKupo = Math.round(precioKupo * pctKupoNum / 100);
  const financiadoKupo = precioKupo - inicialKupo;

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
    } else if (esKrediyaOPayJoy) {
      if (!pctNum) {
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
              : `Los medios de pago se pasan por $${Math.abs(diferenciaMedios).toLocaleString("es-CO")}.`,
        });
        return;
      }
    }

    // Convertir selección del asesor a pagos numéricos > 0
    const pagosArray = seleccionados
      .map((s) => ({ medio: s.medio, valor: Number(s.valor) || 0 }))
      .filter((p) => p.valor > 0);
    if (pagosArray.length === 0) {
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
          valorRecibir: form.valorRecibir ? Number(form.valorRecibir) : undefined,
          pagos: pagosArray,
          observaciones: form.observaciones || undefined,
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
            onChange={(e) => actualizar("financiera", e.target.value)}
            className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
          >
            <option value="">-- Seleccionar --</option>
            {sedeInfo?.financieras.map((f) => (
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
          placeholder="1500000"
        />

        {/* +KUPO con iPhone: flujo especial de porcentaje */}
        {esKupoIphone && valorTotalNum > 0 && (
          <div className="bg-[#0b0d12] border border-orange-900/60 rounded-lg p-3 space-y-3">
            <div className="text-xs text-brand font-bold uppercase tracking-wider">
              +Kupo · iPhone — Flujo especial
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-muted">
                  % que recibe Credicell (inicial)
                </label>
                <span className="text-brand font-bold">{pctKupoNum}%</span>
              </div>
              <input
                type="range"
                min={minPctKupo}
                max={80}
                step={1}
                value={pctKupoNum}
                onChange={(e) => actualizar("porcentajeKupo", e.target.value)}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>Mín {minPctKupo}%</span>
                <span>80%</span>
              </div>
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


        {/* +KUPO Android/Otro */}
        {esKupoAndroid && valorTotalNum > 0 && (
          <div className="bg-[#0b0d12] border border-orange-900/60 rounded-lg p-3 space-y-3">
            <div className="text-xs text-brand font-bold uppercase tracking-wider">
              +Kupo · Android / Otro
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-muted">
                  % de cuota inicial
                </label>
                <span className="text-brand font-bold">{pctKupoNum}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={80}
                step={1}
                value={pctKupoNum}
                onChange={(e) => actualizar("porcentajeKupo", e.target.value)}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>20%</span>
                <span>80%</span>
              </div>
            </div>
            <div className="border-t border-[#2a2f3b] pt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Cuota inicial ({pctKupoNum}%):</span>
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
              placeholder={valorPctOficial ? String(valorPctOficial) : "ej: 400000"}
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

        <div className="pt-2 border-t border-[#2a2f3b] mt-4">
          <p className="text-xs text-muted mb-2 font-medium">
            Desglose del pago por medio
            {esContado
              ? " — debe sumar el valor total"
              : esKrediyaOPayJoy
                ? " — debe sumar el valor a recibir (cuota inicial real)"
                : esKupoIphone
                  ? ` — debe sumar el inicial ($${inicialKupo.toLocaleString("es-CO")})`
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

              {esKrediyaOPayJoy && valorRecibirNum > 0 && (
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
      </div>

      <button
        onClick={confirmar}
        disabled={estado.tipo === "guardando"}
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
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

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
  color: string;
  imei: string;
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
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  const [form, setForm] = useState({
    financiera: "",
    valorTotal: "",
    porcentajeCuota: "",
    valorRecibir: "",
    efectivo: "",
    transferencia: "",
    nequi: "",
    datafono: "",
    wompi: "",
    otro: "",
    observaciones: "",
  });

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
        const [rProd, rCliente, rSede] = await Promise.all([
          fetch(`/api/producto/buscar-imei?imei=${imei}`),
          fetch(`/api/cliente/buscar?cedula=${cedula}`),
          fetch(`/api/sede/info`),
        ]);
        const dProd = await rProd.json();
        const dCliente = await rCliente.json();
        const dSede = await rSede.json();

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
        setEstado({ tipo: "listo" });
      } catch (e: any) {
        setEstado({ tipo: "error", mensaje: e?.message || "Error de red" });
      }
    })();
  }, [status, cedula, imei]);

  function actualizar(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // Cálculos derivados
  const valorTotalNum = Number(form.valorTotal) || 0;
  const pagadoNum =
    (Number(form.efectivo) || 0) +
    (Number(form.transferencia) || 0) +
    (Number(form.nequi) || 0) +
    (Number(form.datafono) || 0) +
    (Number(form.wompi) || 0) +
    (Number(form.otro) || 0);
  const restante = valorTotalNum - pagadoNum;
  const esContado = form.financiera.toUpperCase() === "CONTADO";
  // % oficial de la financiera (20/25/30/35/40/45/50)
  const pctNum = Number(form.porcentajeCuota) || 0;
  // Valor % oficial que la financiera esperaría recibir de inicial
  const valorPctOficial = pctNum > 0 ? Math.round((valorTotalNum * pctNum) / 100) : 0;
  // Valor que el asesor realmente va a cobrar al cliente de inicial
  // (puede ser menor al oficial si le hace descuento)
  const valorRecibirNum = Number(form.valorRecibir) || 0;
  // Descuento = lo que NO se cobró respecto al % oficial
  const descuentoFinanciera = valorPctOficial > 0 ? valorPctOficial - valorRecibirNum : 0;
  // Diferencia entre lo que el asesor dice que va a recibir y lo que
  // realmente desglosó en los medios de pago — debe ser 0
  const diferenciaMedios = valorRecibirNum - pagadoNum;
  const esKrediyaOPayJoy =
    form.financiera === "KREDIYA" || form.financiera === "PAYJOY";

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
    if (esKrediyaOPayJoy) {
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
          valorRecibir: form.valorRecibir ? Number(form.valorRecibir) : undefined,
          efectivo: form.efectivo ? Number(form.efectivo) : undefined,
          transferencia: form.transferencia ? Number(form.transferencia) : undefined,
          nequi: form.nequi ? Number(form.nequi) : undefined,
          datafono: form.datafono ? Number(form.datafono) : undefined,
          wompi: form.wompi ? Number(form.wompi) : undefined,
          otro: form.otro ? Number(form.otro) : undefined,
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
            El equipo quedó marcado como VENDIDO en el inventario. Ya no aparece en Paso 2.
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
                : " — lo que pagó el cliente hoy"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Numero
              label="Efectivo"
              value={form.efectivo}
              onChange={(v) => actualizar("efectivo", v)}
            />
            <Numero
              label="Transferencia"
              value={form.transferencia}
              onChange={(v) => actualizar("transferencia", v)}
            />
            <Numero
              label="Nequi"
              value={form.nequi}
              onChange={(v) => actualizar("nequi", v)}
            />
            <Numero
              label="Datáfono"
              value={form.datafono}
              onChange={(v) => actualizar("datafono", v)}
            />
            <Numero
              label="Wompi"
              value={form.wompi}
              onChange={(v) => actualizar("wompi", v)}
            />
            <Numero
              label="Otro"
              value={form.otro}
              onChange={(v) => actualizar("otro", v)}
            />
          </div>

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

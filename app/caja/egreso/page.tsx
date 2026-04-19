"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NUEVO = "__NUEVO__";

export default function RegistrarEgreso() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [catalogo, setCatalogo] = useState<{
    conceptos: string[];
    establecimientos: string[];
  }>({ conceptos: [], establecimientos: [] });
  const [saldo, setSaldo] = useState<number | null>(null);

  const [form, setForm] = useState({
    concepto: "",
    conceptoNuevo: "",
    establecimiento: "",
    establecimientoNuevo: "",
    monto: "",
    referencia: "",
    urlFactura: "",
    prestamoOtraSede: false,
    observaciones: "",
  });
  const [estado, setEstado] = useState<
    | { tipo: "inicial" }
    | { tipo: "guardando" }
    | { tipo: "ok"; saldoDespues: number }
    | { tipo: "error"; mensaje: string }
  >({ tipo: "inicial" });

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/caja/movimientos")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setCatalogo(d.catalogo);
          setSaldo(d.saldo);
        }
      });
  }, [status]);

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  function actualizar(campo: string, valor: any) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  const conceptoFinal =
    form.concepto === NUEVO ? form.conceptoNuevo.trim() : form.concepto;
  const establecimientoFinal =
    form.establecimiento === NUEVO
      ? form.establecimientoNuevo.trim()
      : form.establecimiento;

  async function guardar() {
    if (!conceptoFinal) {
      setEstado({ tipo: "error", mensaje: "Selecciona o crea un concepto" });
      return;
    }
    const montoNum = Number(form.monto);
    if (!montoNum || montoNum <= 0) {
      setEstado({ tipo: "error", mensaje: "Monto inválido" });
      return;
    }
    setEstado({ tipo: "guardando" });
    try {
      const r = await fetch("/api/caja/egreso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concepto: conceptoFinal,
          establecimiento: establecimientoFinal || undefined,
          monto: montoNum,
          referencia: form.referencia.trim() || undefined,
          urlFactura: form.urlFactura.trim() || undefined,
          prestamoOtraSede: form.prestamoOtraSede,
          observaciones: form.observaciones.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setEstado({ tipo: "error", mensaje: data.error || "Error" });
        return;
      }
      setEstado({ tipo: "ok", saldoDespues: data.saldoDespues });
    } catch (e: any) {
      setEstado({ tipo: "error", mensaje: e?.message || "Error de red" });
    }
  }

  const fmt = (n: number) => `$${(n || 0).toLocaleString("es-CO")}`;

  if (estado.tipo === "ok") {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto">
        <div className="bg-[#141821] border border-green-800 rounded-xl p-6 mb-6">
          <div className="text-green-400 text-xs mb-2">✓ EGRESO REGISTRADO</div>
          <div className="font-bold text-lg mb-2">{conceptoFinal}</div>
          <div className="text-sm text-muted mb-3">
            {fmt(Number(form.monto))} — saldo después: {fmt(estado.saldoDespues)}
          </div>
          <p className="text-xs text-muted">
            Quedó en la pestaña "Caja 2026" de tu libro.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/caja")}
            className="flex-1 py-3 bg-[#141821] border border-[#2a2f3b] text-white rounded-lg"
          >
            Ver caja
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 py-3 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-lg"
          >
            Registrar otro
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push("/caja")}
          className="text-muted text-sm hover:text-white"
        >
          ← Caja
        </button>
        {saldo !== null && (
          <div className="text-xs text-muted">
            Saldo actual: <span className="text-white">{fmt(saldo)}</span>
          </div>
        )}
      </div>

      <h1 className="text-2xl font-bold mb-1">Registrar egreso</h1>
      <p className="text-muted text-sm mb-6">
        Sale plata de la caja de la tienda. Foto de factura obligatoria para
        gastos &gt; $20.000.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted mb-1">Concepto *</label>
          <select
            value={form.concepto}
            onChange={(e) => actualizar("concepto", e.target.value)}
            className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
          >
            <option value="">-- Seleccionar --</option>
            {catalogo.conceptos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={NUEVO}>+ Nuevo concepto...</option>
          </select>
          {form.concepto === NUEVO && (
            <input
              type="text"
              placeholder="Ej: MANTENIMIENTO EQUIPOS"
              value={form.conceptoNuevo}
              onChange={(e) => actualizar("conceptoNuevo", e.target.value)}
              className="mt-2 w-full px-3 py-2 bg-[#0b0d12] border border-yellow-700 rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-yellow-500 text-sm"
            />
          )}
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">
            Establecimiento (a quién se le pagó)
          </label>
          <select
            value={form.establecimiento}
            onChange={(e) => actualizar("establecimiento", e.target.value)}
            className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
          >
            <option value="">-- Sin especificar --</option>
            {catalogo.establecimientos.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
            <option value={NUEVO}>+ Nuevo establecimiento...</option>
          </select>
          {form.establecimiento === NUEVO && (
            <input
              type="text"
              placeholder="Ej: Droguería San Esteban"
              value={form.establecimientoNuevo}
              onChange={(e) => actualizar("establecimientoNuevo", e.target.value)}
              className="mt-2 w-full px-3 py-2 bg-[#0b0d12] border border-yellow-700 rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-yellow-500 text-sm"
            />
          )}
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Monto *</label>
          <input
            type="tel"
            inputMode="numeric"
            value={form.monto}
            onChange={(e) => actualizar("monto", e.target.value.replace(/[^\d]/g, ""))}
            placeholder="50000"
            className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">
            Referencia (número de factura, recibo, etc.)
          </label>
          <input
            type="text"
            value={form.referencia}
            onChange={(e) => actualizar("referencia", e.target.value)}
            placeholder="FAC-12345"
            className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">
            URL foto de factura (sube la foto a Drive y pega el link)
          </label>
          <input
            type="url"
            value={form.urlFactura}
            onChange={(e) => actualizar("urlFactura", e.target.value)}
            placeholder="https://drive.google.com/..."
            className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm"
          />
          <p className="text-[10px] text-muted mt-1">
            (Próxima versión: podrás subir la foto directamente desde el
            celular, sin pasar por Drive a mano.)
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.prestamoOtraSede}
            onChange={(e) => actualizar("prestamoOtraSede", e.target.checked)}
            className="w-4 h-4"
          />
          <span>Préstamo para compra de OTRA sede (no de esta)</span>
        </label>

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
        onClick={guardar}
        disabled={estado.tipo === "guardando"}
        className="w-full mt-6 py-3 bg-brand hover:bg-brand-light disabled:opacity-40 text-[#0b0d12] font-bold rounded-lg"
      >
        {estado.tipo === "guardando" ? "Guardando..." : "Registrar egreso"}
      </button>

      {estado.tipo === "error" && (
        <div className="mt-4 bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm">
          <strong>Error:</strong> {estado.mensaje}
        </div>
      )}
    </main>
  );
}

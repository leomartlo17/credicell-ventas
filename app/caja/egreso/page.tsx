"use client";

export const dynamic = "force-dynamic";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const NUEVO = "__NUEVO__";
const UMBRAL_FACTURA = 20_000;
const UMBRAL_AUTORIZACION = 100_000;

export default function EgresoWrapper() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-sm">Cargando...</p>
        </main>
      }
    >
      <RegistrarEgreso />
    </Suspense>
  );
}

function RegistrarEgreso() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [catalogo, setCatalogo] = useState<{
    conceptos: string[];
    establecimientos: string[];
  }>({ conceptos: [], establecimientos: [] });
  const [saldo, setSaldo] = useState<number | null>(null);
  const [fotoUploadDisponible, setFotoUploadDisponible] = useState(false);

  // Pre-carga desde query params (viene de "Duplicar" en /caja/egresos)
  const [form, setForm] = useState({
    concepto: searchParams.get("concepto") || "",
    conceptoNuevo: "",
    establecimiento: searchParams.get("establecimiento") || "",
    establecimientoNuevo: "",
    monto: searchParams.get("monto") || "",
    referencia: "",
    urlFactura: "",
    prestamoOtraSede: searchParams.get("prestamo") === "1",
    observaciones: "",
    autorizadoPor: searchParams.get("autorizado") || "",
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

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
    // Detectar si upload de fotos está configurado (env var en Vercel)
    fetch("/api/caja/foto-upload")
      .then((r) => r.json())
      .then((d) => setFotoUploadDisponible(Boolean(d.disponible)))
      .catch(() => setFotoUploadDisponible(false));
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
  const montoNum = Number(form.monto) || 0;

  // Reglas de validación visibles
  const requiereFactura = montoNum > UMBRAL_FACTURA;
  const requiereAutorizacion = montoNum > UMBRAL_AUTORIZACION;
  const faltaFactura =
    requiereFactura && !form.urlFactura.trim() && !archivo;
  const faltaAutorizacion =
    requiereAutorizacion && !form.autorizadoPor.trim();

  async function subirFotoSiHay(): Promise<string | null> {
    if (!archivo) return null;
    setSubiendoFoto(true);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("referencia", form.referencia.trim());
      const r = await fetch("/api/caja/foto-upload", {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        throw new Error(d.error || "Error subiendo foto");
      }
      return d.url;
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function guardar() {
    if (!conceptoFinal) {
      setEstado({ tipo: "error", mensaje: "Selecciona o crea un concepto" });
      return;
    }
    if (!montoNum || montoNum <= 0) {
      setEstado({ tipo: "error", mensaje: "Monto inválido" });
      return;
    }
    if (faltaFactura) {
      setEstado({
        tipo: "error",
        mensaje: `Foto de factura obligatoria para egresos > $${UMBRAL_FACTURA.toLocaleString("es-CO")}`,
      });
      return;
    }
    if (faltaAutorizacion) {
      setEstado({
        tipo: "error",
        mensaje: `Autorización obligatoria para egresos > $${UMBRAL_AUTORIZACION.toLocaleString("es-CO")}`,
      });
      return;
    }

    setEstado({ tipo: "guardando" });
    try {
      // 1) Subir foto a Drive si hay archivo
      let urlFinal = form.urlFactura.trim();
      if (archivo) {
        const uploaded = await subirFotoSiHay();
        if (uploaded) urlFinal = uploaded;
      }

      // 2) Registrar egreso
      const r = await fetch("/api/caja/egreso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concepto: conceptoFinal,
          establecimiento: establecimientoFinal || undefined,
          monto: montoNum,
          referencia: form.referencia.trim() || undefined,
          urlFactura: urlFinal || undefined,
          prestamoOtraSede: form.prestamoOtraSede,
          observaciones: form.observaciones.trim() || undefined,
          autorizadoPor: form.autorizadoPor.trim() || undefined,
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
            onClick={() => router.push("/caja/egresos")}
            className="flex-1 py-3 bg-[#141821] border border-[#2a2f3b] text-white rounded-lg"
          >
            Ver egresos
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
        Sale plata de la caja de la tienda. Reglas:
        factura obligatoria &gt; {fmt(UMBRAL_FACTURA)}, autorización obligatoria &gt; {fmt(UMBRAL_AUTORIZACION)}.
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
              onChange={(e) =>
                actualizar("establecimientoNuevo", e.target.value)
              }
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
            onChange={(e) =>
              actualizar("monto", e.target.value.replace(/[^\d]/g, ""))
            }
            placeholder="50000"
            className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm"
          />
          {montoNum > 0 && (
            <div className="mt-1 text-[11px] text-muted">
              {requiereFactura && (
                <span className={faltaFactura ? "text-yellow-400" : "text-green-400"}>
                  {faltaFactura ? "⚠ " : "✓ "}
                  Requiere factura
                </span>
              )}
              {requiereFactura && requiereAutorizacion && " · "}
              {requiereAutorizacion && (
                <span className={faltaAutorizacion ? "text-yellow-400" : "text-green-400"}>
                  {faltaAutorizacion ? "⚠ " : "✓ "}
                  Requiere autorización
                </span>
              )}
            </div>
          )}
        </div>

        {/* Autorizado por — visible siempre, destacado si obligatorio */}
        <div>
          <label className="block text-xs text-muted mb-1">
            Autorizado por {requiereAutorizacion && <span className="text-yellow-400">*</span>}
          </label>
          <input
            type="text"
            value={form.autorizadoPor}
            onChange={(e) => actualizar("autorizadoPor", e.target.value)}
            placeholder="J.A, J.D, o nombre de quien autorizó"
            className={`w-full px-3 py-2 bg-[#0b0d12] border rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none text-sm ${
              faltaAutorizacion
                ? "border-yellow-700 focus:border-yellow-500"
                : "border-[#2a2f3b] focus:border-brand"
            }`}
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

        {/* Upload de foto — cambia entre file picker y URL manual según setup */}
        <div>
          <label className="block text-xs text-muted mb-1">
            Factura (foto) {requiereFactura && <span className="text-yellow-400">*</span>}
          </label>
          {fotoUploadDisponible ? (
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setArchivo(f);
                  if (f) actualizar("urlFactura", ""); // si subieron archivo, ignora URL
                }}
                className="w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-brand file:text-[#0b0d12] file:text-sm file:font-medium hover:file:bg-brand-light"
              />
              {archivo && (
                <div className="text-xs text-green-400">
                  ✓ {archivo.name} ({Math.round(archivo.size / 1024)} KB)
                </div>
              )}
              <details className="text-xs text-muted">
                <summary className="cursor-pointer hover:text-white">
                  O pega una URL de Drive (avanzado)
                </summary>
                <input
                  type="url"
                  value={form.urlFactura}
                  onChange={(e) => actualizar("urlFactura", e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="mt-2 w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm"
                />
              </details>
            </div>
          ) : (
            <div>
              <input
                type="url"
                value={form.urlFactura}
                onChange={(e) => actualizar("urlFactura", e.target.value)}
                placeholder="https://drive.google.com/..."
                className={`w-full px-3 py-2 bg-[#0b0d12] border rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none text-sm ${
                  faltaFactura
                    ? "border-yellow-700 focus:border-yellow-500"
                    : "border-[#2a2f3b] focus:border-brand"
                }`}
              />
              <p className="text-[10px] text-muted mt-1">
                Upload directo aún no está configurado. Sube la foto a Drive y pega el link.
              </p>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.prestamoOtraSede}
            onChange={(e) =>
              actualizar("prestamoOtraSede", e.target.checked)
            }
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
        disabled={estado.tipo === "guardando" || subiendoFoto}
        className="w-full mt-6 py-3 bg-brand hover:bg-brand-light disabled:opacity-40 text-[#0b0d12] font-bold rounded-lg"
      >
        {subiendoFoto
          ? "Subiendo foto..."
          : estado.tipo === "guardando"
            ? "Guardando..."
            : "Registrar egreso"}
      </button>

      {estado.tipo === "error" && (
        <div className="mt-4 bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm">
          <strong>Error:</strong> {estado.mensaje}
        </div>
      )}
    </main>
  );
}

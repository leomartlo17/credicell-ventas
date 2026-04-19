"use client";

export const dynamic = "force-dynamic";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Egreso = {
  fila: number;
  fecha: string;
  hora: string;
  tipo: string;
  concepto: string;
  establecimiento: string;
  monto: number;
  saldoDespues: number;
  asesor: string;
  referencia: string;
  urlFactura: string;
  observaciones: string;
  autorizadoPor: string;
  anulaFila?: number;
  anuladoEnFila?: number;
  anulado: boolean;
  esAnulacion: boolean;
  prestamoOtraSede: boolean;
};

type Catalogo = {
  conceptos: string[];
  establecimientos: string[];
};

const PERIODOS = [
  { id: "hoy", label: "Hoy" },
  { id: "mes", label: "Este mes" },
  { id: "30dias", label: "Últimos 30 días" },
  { id: "todo", label: "Todo" },
];

export default function VistaEgresos() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [catalogo, setCatalogo] = useState<Catalogo>({
    conceptos: [],
    establecimientos: [],
  });
  const [saldo, setSaldo] = useState(0);
  const [esAdmin, setEsAdmin] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  // Filtros
  const [periodo, setPeriodo] = useState("mes");
  const [concepto, setConcepto] = useState("");
  const [establecimiento, setEstablecimiento] = useState("");
  const [autorizado, setAutorizado] = useState("");
  const [incluirAnulados, setIncluirAnulados] = useState(true);

  // Anular
  const [anulando, setAnulando] = useState<number | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [guardandoAnulacion, setGuardandoAnulacion] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    cargar();
  }, [status, periodo, concepto, establecimiento, autorizado, incluirAnulados]);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("periodo", periodo);
      if (concepto) params.set("concepto", concepto);
      if (establecimiento) params.set("establecimiento", establecimiento);
      if (autorizado) params.set("autorizado", autorizado);
      params.set("incluirAnulados", incluirAnulados ? "1" : "0");
      const r = await fetch(`/api/caja/egresos?${params}`);
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Error al cargar");
        return;
      }
      setEgresos(d.egresos || []);
      setCatalogo(d.catalogo || { conceptos: [], establecimientos: [] });
      setSaldo(d.saldo || 0);
      setEsAdmin(Boolean(d.esAdmin));
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setCargando(false);
    }
  }

  async function confirmarAnular() {
    if (anulando == null) return;
    if (motivoAnulacion.trim().length < 3) {
      setError("Escribe el motivo de la anulación (mínimo 3 caracteres)");
      return;
    }
    setGuardandoAnulacion(true);
    setError("");
    try {
      const r = await fetch("/api/caja/anular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fila: anulando, motivo: motivoAnulacion.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || "Error al anular");
        return;
      }
      setMensaje(`Movimiento fila ${anulando} anulado. Saldo: $${d.saldoDespues.toLocaleString("es-CO")}`);
      setAnulando(null);
      setMotivoAnulacion("");
      await cargar();
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setGuardandoAnulacion(false);
    }
  }

  function duplicar(e: Egreso) {
    // Navega al form de egreso con params pre-cargados
    const params = new URLSearchParams();
    if (e.concepto) params.set("concepto", e.concepto);
    if (e.establecimiento) params.set("establecimiento", e.establecimiento);
    if (e.monto) params.set("monto", String(e.monto));
    if (e.autorizadoPor) params.set("autorizado", e.autorizadoPor);
    if (e.prestamoOtraSede) params.set("prestamo", "1");
    router.push(`/caja/egreso?${params}`);
  }

  const fmt = (n: number) => `$${(n || 0).toLocaleString("es-CO")}`;

  const totales = useMemo(() => {
    let totalActivos = 0;
    let totalAnulados = 0;
    let totalAnulaciones = 0;
    for (const e of egresos) {
      if (e.esAnulacion) totalAnulaciones += e.monto;
      else if (e.anulado) totalAnulados += e.monto;
      else totalActivos += e.monto;
    }
    return { totalActivos, totalAnulados, totalAnulaciones };
  }, [egresos]);

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push("/caja")}
          className="text-muted text-sm hover:text-white"
        >
          ← Caja
        </button>
        <div className="text-xs text-muted">
          Saldo: <span className="text-white">{fmt(saldo)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Egresos</h1>
        <button
          onClick={() => router.push("/caja/egreso")}
          className="px-4 py-2 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-lg text-sm"
        >
          + Nuevo egreso
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4 mb-4 space-y-3">
        <div>
          <label className="block text-xs text-muted mb-2">Período</label>
          <div className="flex flex-wrap gap-2">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className={`px-3 py-1.5 rounded text-sm border ${
                  periodo === p.id
                    ? "bg-brand text-[#0b0d12] border-brand font-medium"
                    : "bg-[#0b0d12] text-muted border-[#2a2f3b] hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Concepto</label>
            <select
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded text-white text-sm"
            >
              <option value="">-- Todos --</option>
              {catalogo.conceptos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Establecimiento</label>
            <select
              value={establecimiento}
              onChange={(e) => setEstablecimiento(e.target.value)}
              className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded text-white text-sm"
            >
              <option value="">-- Todos --</option>
              {catalogo.establecimientos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Autorizado por</label>
            <input
              type="text"
              value={autorizado}
              onChange={(e) => setAutorizado(e.target.value)}
              placeholder="J.A, J.D..."
              className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded text-white text-sm"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={incluirAnulados}
            onChange={(e) => setIncluirAnulados(e.target.checked)}
            className="w-4 h-4"
          />
          Mostrar también movimientos anulados (para trazabilidad)
        </label>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3">
          <div className="text-[10px] text-muted uppercase tracking-wide">
            Total egresos activos
          </div>
          <div className="text-lg font-bold text-red-400">
            {fmt(totales.totalActivos)}
          </div>
          <div className="text-xs text-muted">
            {egresos.filter((e) => !e.anulado && !e.esAnulacion).length} movimientos
          </div>
        </div>
        <div className="bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3">
          <div className="text-[10px] text-muted uppercase tracking-wide">
            Anulados
          </div>
          <div className="text-lg font-bold text-muted">
            {fmt(totales.totalAnulados)}
          </div>
          <div className="text-xs text-muted">
            {egresos.filter((e) => e.anulado).length} movimientos
          </div>
        </div>
        <div className="bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3">
          <div className="text-[10px] text-muted uppercase tracking-wide">
            Anulaciones registradas
          </div>
          <div className="text-lg font-bold text-muted">
            {egresos.filter((e) => e.esAnulacion).length}
          </div>
        </div>
      </div>

      {mensaje && (
        <div className="mb-4 bg-green-950 border border-green-800 rounded-lg p-3 text-green-300 text-sm">
          {mensaje}
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-950 border border-red-800 rounded-lg p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Lista */}
      {cargando ? (
        <p className="text-muted text-sm">Cargando egresos...</p>
      ) : egresos.length === 0 ? (
        <div className="bg-[#141821] border border-[#2a2f3b] rounded-lg p-8 text-center">
          <p className="text-muted text-sm">
            No hay egresos en el período seleccionado.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {egresos.map((e) => (
            <div
              key={e.fila}
              className={`border rounded-lg p-3 ${
                e.esAnulacion
                  ? "bg-[#0b0d12] border-yellow-900/50 opacity-80"
                  : e.anulado
                    ? "bg-[#0b0d12] border-[#2a2f3b] opacity-50"
                    : "bg-[#141821] border-[#2a2f3b]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{e.concepto}</span>
                    {e.esAnulacion && (
                      <span className="text-[10px] bg-yellow-900 text-yellow-300 px-1.5 py-0.5 rounded">
                        ANULACIÓN · fila {e.anulaFila}
                      </span>
                    )}
                    {e.anulado && (
                      <span className="text-[10px] bg-[#2a2f3b] text-muted px-1.5 py-0.5 rounded">
                        ANULADO en fila {e.anuladoEnFila}
                      </span>
                    )}
                    {e.prestamoOtraSede && (
                      <span className="text-[10px] bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded">
                        PRÉSTAMO OTRA SEDE
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{e.fecha} {e.hora}</span>
                    {e.establecimiento && <span>→ {e.establecimiento}</span>}
                    {e.autorizadoPor && (
                      <span>Autorizó: <span className="text-white">{e.autorizadoPor}</span></span>
                    )}
                    <span>por {e.asesor}</span>
                  </div>
                  {e.referencia && (
                    <div className="text-xs text-muted mt-1">
                      Ref: <span className="text-white font-mono">{e.referencia}</span>
                    </div>
                  )}
                  {e.observaciones && (
                    <div className="text-xs text-muted mt-1 italic">
                      {e.observaciones}
                    </div>
                  )}
                  {e.urlFactura && (
                    <a
                      href={e.urlFactura}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-brand hover:text-brand-light underline mt-1 inline-block"
                    >
                      📎 Ver factura
                    </a>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`text-lg font-bold font-mono ${
                      e.esAnulacion
                        ? "text-yellow-400"
                        : e.anulado
                          ? "text-muted line-through"
                          : "text-red-400"
                    }`}
                  >
                    {fmt(Math.abs(e.monto))}
                  </div>
                  <div className="text-[10px] text-muted">
                    fila {e.fila}
                  </div>
                </div>
              </div>

              {/* Acciones — solo para egresos activos (no anulados, no anulaciones) */}
              {!e.anulado && !e.esAnulacion && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-[#2a2f3b]">
                  <button
                    onClick={() => duplicar(e)}
                    className="px-3 py-1 text-xs bg-[#0b0d12] hover:bg-[#1e242f] border border-[#2a2f3b] text-muted hover:text-white rounded"
                  >
                    Duplicar
                  </button>
                  {esAdmin && (
                    <button
                      onClick={() => {
                        setAnulando(e.fila);
                        setMotivoAnulacion("");
                      }}
                      className="px-3 py-1 text-xs bg-[#0b0d12] hover:bg-red-950 border border-[#2a2f3b] hover:border-red-800 text-muted hover:text-red-300 rounded"
                    >
                      Anular
                    </button>
                  )}
                </div>
              )}

              {/* Modal inline de anulación */}
              {anulando === e.fila && (
                <div className="mt-3 pt-3 border-t border-red-900 bg-red-950/20 -mx-3 -mb-3 p-3 rounded-b-lg">
                  <p className="text-xs text-red-300 mb-2 font-medium">
                    Anular este egreso — se creará una fila ANULACIÓN en Caja 2026, el
                    original no se borra.
                  </p>
                  <textarea
                    value={motivoAnulacion}
                    onChange={(ev) => setMotivoAnulacion(ev.target.value)}
                    placeholder="Motivo (ej: error de digitación, cargo duplicado, devolución al proveedor...)"
                    rows={2}
                    className="w-full px-3 py-2 bg-[#0b0d12] border border-red-900 rounded text-white text-sm"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={confirmarAnular}
                      disabled={guardandoAnulacion || motivoAnulacion.trim().length < 3}
                      className="flex-1 py-2 bg-red-900 hover:bg-red-800 disabled:opacity-40 text-red-100 text-sm font-medium rounded"
                    >
                      {guardandoAnulacion ? "Anulando..." : "Confirmar anulación"}
                    </button>
                    <button
                      onClick={() => {
                        setAnulando(null);
                        setMotivoAnulacion("");
                      }}
                      className="px-4 py-2 bg-[#0b0d12] border border-[#2a2f3b] text-muted hover:text-white text-sm rounded"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

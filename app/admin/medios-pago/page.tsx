"use client";

export const dynamic = "force-dynamic";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Medio = {
  nombre: string;
  activo: boolean;
  fechaCreacion: string;
  creadoPor: string;
  observaciones: string;
  esCore: boolean;
};

export default function AdminMediosPago() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [medios, setMedios] = useState<Medio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaObs, setNuevaObs] = useState("");
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    cargar();
  }, [status]);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const r = await fetch("/api/medios-pago?incluirInactivos=1");
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Error al cargar");
        return;
      }
      setMedios(d.medios || []);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setCargando(false);
    }
  }

  async function crear() {
    setMensaje("");
    setError("");
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      setError("Escribe un nombre");
      return;
    }
    setCreando(true);
    try {
      const r = await fetch("/api/medios-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          observaciones: nuevaObs.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || "Error al crear");
        return;
      }
      setMensaje(`✓ "${d.medio.nombre}" creado`);
      setNuevoNombre("");
      setNuevaObs("");
      await cargar();
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setCreando(false);
    }
  }

  async function toggle(m: Medio) {
    if (m.esCore) return; // No se puede desactivar core
    setMensaje("");
    setError("");
    try {
      const r = await fetch("/api/medios-pago", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: m.nombre, activar: !m.activo }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || "Error al cambiar estado");
        return;
      }
      await cargar();
    } catch (e: any) {
      setError(e?.message || "Error de red");
    }
  }

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  if (!(session as any).esAdmin) {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto">
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm mb-4">
          Solo administradores pueden gestionar medios de pago.
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="px-4 py-2 bg-[#141821] border border-[#2a2f3b] text-white rounded-lg"
        >
          ← Volver al dashboard
        </button>
      </main>
    );
  }

  const activos = medios.filter((m) => m.activo);
  const inactivos = medios.filter((m) => !m.activo);

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-muted text-sm hover:text-white"
        >
          ← Dashboard
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-1">Medios de pago</h1>
      <p className="text-muted text-sm mb-6">
        Catálogo del libro. Los asesores verán solo los que estén activos al
        registrar una venta. Nada se borra — los medios se desactivan y quedan
        registrados en la hoja MEDIOS_PAGO.
      </p>

      {/* Crear nuevo */}
      <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium mb-3">Agregar medio nuevo</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">
              Nombre (ej: DAVIPLATA, BRE-B, BANCOLOMBIA QR)
            </label>
            <input
              type="text"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm uppercase"
              placeholder="Ej: DAVIPLATA"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Observaciones (opcional)
            </label>
            <input
              type="text"
              value={nuevaObs}
              onChange={(e) => setNuevaObs(e.target.value)}
              className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
              placeholder="Ej: disponible desde abril 2026"
            />
          </div>
          <button
            onClick={crear}
            disabled={creando || !nuevoNombre.trim()}
            className="px-4 py-2 bg-brand hover:bg-brand-light disabled:opacity-40 text-[#0b0d12] font-bold rounded-lg text-sm"
          >
            {creando ? "Creando..." : "Agregar al catálogo"}
          </button>
        </div>
      </div>

      {mensaje && (
        <div className="mb-4 bg-green-950 border border-green-800 rounded-xl p-3 text-green-300 text-sm">
          {mensaje}
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="text-muted text-sm">Cargando catálogo...</p>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-sm font-medium mb-3">
              Activos <span className="text-muted">({activos.length})</span>
            </h2>
            <div className="space-y-2">
              {activos.map((m) => (
                <div
                  key={m.nombre}
                  className="bg-[#141821] border border-[#2a2f3b] rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {m.nombre}
                      {m.esCore && (
                        <span className="text-[10px] bg-[#2a2f3b] text-muted px-1.5 py-0.5 rounded">
                          BASE
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {m.fechaCreacion} · por {m.creadoPor}
                      {m.observaciones && ` · ${m.observaciones}`}
                    </div>
                  </div>
                  {m.esCore ? (
                    <span className="text-xs text-muted">no desactivable</span>
                  ) : (
                    <button
                      onClick={() => toggle(m)}
                      className="px-3 py-1 text-xs bg-[#0b0d12] hover:bg-[#1e242f] border border-[#2a2f3b] text-muted hover:text-white rounded"
                    >
                      Desactivar
                    </button>
                  )}
                </div>
              ))}
              {activos.length === 0 && (
                <p className="text-muted text-sm">Sin medios activos</p>
              )}
            </div>
          </div>

          {inactivos.length > 0 && (
            <div>
              <h2 className="text-sm font-medium mb-3">
                Inactivos <span className="text-muted">({inactivos.length})</span>
              </h2>
              <div className="space-y-2">
                {inactivos.map((m) => (
                  <div
                    key={m.nombre}
                    className="bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3 flex items-center justify-between opacity-70"
                  >
                    <div>
                      <div className="font-medium text-muted">{m.nombre}</div>
                      <div className="text-xs text-muted">
                        {m.fechaCreacion} · por {m.creadoPor}
                      </div>
                    </div>
                    <button
                      onClick={() => toggle(m)}
                      className="px-3 py-1 text-xs bg-[#0b0d12] hover:bg-[#1e242f] border border-[#2a2f3b] text-muted hover:text-white rounded"
                    >
                      Reactivar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

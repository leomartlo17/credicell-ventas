"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Hoja = { nombre: string; protegida: boolean };

export default function LimpiarLibro() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<any>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const r = await fetch("/api/admin/limpiar");
      const d = await r.json();
      if (!r.ok) setError(d.error || "Error");
      else {
        setHojas(d.hojas || []);
        // Por defecto, TODAS las NO protegidas seleccionadas (pero usuario
        // puede desmarcar las que quiera conservar)
        setSeleccionadas(
          new Set(
            (d.hojas || [])
              .filter((h: Hoja) => !h.protegida)
              .map((h: Hoja) => h.nombre)
          )
        );
      }
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    cargar();
  }, [status]);

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  function toggle(nombre: string) {
    const nueva = new Set(seleccionadas);
    if (nueva.has(nombre)) nueva.delete(nombre);
    else nueva.add(nombre);
    setSeleccionadas(nueva);
  }

  async function ejecutar() {
    if (confirmacion !== "BORRAR") {
      setError("Tienes que escribir BORRAR exacto para confirmar.");
      return;
    }
    if (seleccionadas.size === 0) {
      setError("No seleccionaste ninguna pestaña para borrar.");
      return;
    }
    setError("");
    setResultado(null);
    try {
      const r = await fetch("/api/admin/limpiar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pestanasAEliminar: Array.from(seleccionadas),
          confirmacion: "BORRAR",
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || "Error al borrar");
        return;
      }
      setResultado(d);
      // refrescar lista
      await cargar();
      setConfirmacion("");
    } catch (e: any) {
      setError(e?.message || "Error de red");
    }
  }

  const eliminables = hojas.filter((h) => !h.protegida);
  const protegidas = hojas.filter((h) => h.protegida);

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-muted text-sm hover:text-white"
        >
          ← Dashboard
        </button>
        <button
          onClick={cargar}
          disabled={cargando}
          className="px-3 py-1 text-xs bg-[#141821] hover:bg-[#1e242f] border border-[#2a2f3b] text-muted hover:text-white rounded-lg"
        >
          ↻ Refrescar
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-1">Limpiar libro</h1>
      <p className="text-muted text-sm mb-6">
        Borra pestañas viejas del libro para empezar limpio con el sistema
        nuevo. <strong className="text-yellow-400">Esto es IRREVERSIBLE</strong> —
        los datos de las pestañas borradas se pierden.
      </p>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {resultado && (
        <div className="bg-[#141821] border border-green-800 rounded-xl p-4 mb-4 text-sm">
          <div className="text-green-400 font-bold mb-2">✓ Listo</div>
          <p>
            Borradas: {resultado.borradas} de {resultado.totalSolicitadas}
          </p>
          {resultado.advertencia && (
            <p className="text-yellow-400 text-xs mt-2">{resultado.advertencia}</p>
          )}
          {resultado.resultados && (
            <ul className="mt-2 text-xs text-muted space-y-1">
              {resultado.resultados.map((r: any) => (
                <li key={r.pestana}>
                  {r.borrada ? "✓" : "✗"} {r.pestana}
                  {r.error && <span className="text-red-400 ml-2">({r.error})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {cargando && <p className="text-muted text-sm">Cargando pestañas...</p>}

      {/* PROTEGIDAS — no se pueden borrar */}
      {protegidas.length > 0 && (
        <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4 mb-4">
          <h2 className="text-sm font-bold mb-3 text-brand">
            Pestañas protegidas ({protegidas.length}) — nunca se borran
          </h2>
          <ul className="space-y-1 text-sm">
            {protegidas.map((h) => (
              <li key={h.nombre} className="flex items-center gap-2 text-muted">
                <span className="text-green-400">🔒</span>
                <span>{h.nombre}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ELIMINABLES — con checkboxes */}
      {eliminables.length > 0 && (
        <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4 mb-4">
          <h2 className="text-sm font-bold mb-3 text-yellow-400">
            Pestañas candidatas a borrar ({eliminables.length}) — desmarca las
            que quieras conservar
          </h2>
          <ul className="space-y-2">
            {eliminables.map((h) => (
              <li key={h.nombre}>
                <label className="flex items-center gap-3 cursor-pointer text-sm hover:bg-[#1e242f] p-2 rounded">
                  <input
                    type="checkbox"
                    checked={seleccionadas.has(h.nombre)}
                    onChange={() => toggle(h.nombre)}
                    className="w-4 h-4"
                  />
                  <span className={seleccionadas.has(h.nombre) ? "text-red-300" : "text-muted"}>
                    {seleccionadas.has(h.nombre) ? "🗑" : "·"} {h.nombre}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {eliminables.length === 0 && !cargando && (
        <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4 text-muted text-sm mb-4 text-center">
          No hay pestañas viejas para borrar. Todo limpio.
        </div>
      )}

      {/* CONFIRMACIÓN */}
      {seleccionadas.size > 0 && (
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-4">
          <p className="text-red-300 text-sm mb-3">
            <strong>Vas a borrar {seleccionadas.size} pestaña{seleccionadas.size === 1 ? "" : "s"}</strong> y perder todos sus datos.
            Esta acción NO se puede deshacer.
          </p>
          <label className="block text-xs text-muted mb-1">
            Escribe <strong className="text-white">BORRAR</strong> para confirmar:
          </label>
          <input
            type="text"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder="BORRAR"
            className="w-full px-3 py-2 bg-[#0b0d12] border border-red-700 rounded-lg text-white font-mono focus:outline-none focus:border-red-500 text-sm"
          />
          <button
            onClick={ejecutar}
            disabled={confirmacion !== "BORRAR"}
            className="w-full mt-3 py-3 bg-red-700 hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-lg"
          >
            Borrar {seleccionadas.size} pestaña{seleccionadas.size === 1 ? "" : "s"} AHORA
          </button>
        </div>
      )}
    </main>
  );
}

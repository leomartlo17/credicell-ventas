"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [inicializando, setInicializando] = useState(false);
  const [mensajeInit, setMensajeInit] = useState("");
  const [detallesInit, setDetallesInit] = useState<any>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  async function inicializarHoja() {
    setInicializando(true);
    setMensajeInit("");
    setDetallesInit(null);
    try {
      const r = await fetch("/api/admin/inicializar-inventario", { method: "POST" });
      const data = await r.json();
      setDetallesInit(data);
      if (!r.ok || !data.ok) {
        setMensajeInit(`❌ ${data.error || "Error"}`);
      } else {
        setMensajeInit(data.mensaje);
      }
    } catch (e: any) {
      setMensajeInit(`❌ ${e?.message || "Error de red"}`);
    } finally {
      setInicializando(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  if (!session) return null;

  const sede = (session as any).sede;
  const nombre = session.user?.name?.split(" ")[0] || "Asesor";

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-brand" />
          <span className="font-bold">CREDICELL · Ventas</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-muted text-sm hover:text-white transition-colors"
        >
          Cerrar sesión
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-1">Hola, {nombre}</h1>
      {sede ? (
        <p className="text-muted text-sm mb-8">Tu sede: <span className="text-white font-medium">{sede.nombre}</span></p>
      ) : (
        <p className="text-yellow-400 text-sm mb-8">
          Tu cuenta no está asignada a ninguna sede. Pídele al admin que te agregue.
        </p>
      )}

      <button
        disabled={!sede}
        onClick={() => router.push("/venta/paso1")}
        className="w-full py-4 px-6 bg-brand hover:bg-brand-light disabled:opacity-40 disabled:cursor-not-allowed text-[#0b0d12] font-bold rounded-xl transition-colors text-lg"
      >
        Nueva venta
      </button>

      <button
        disabled={!sede}
        onClick={() => router.push("/inventario/nuevo")}
        className="w-full mt-3 py-3 px-6 bg-[#141821] hover:bg-[#1e242f] disabled:opacity-40 border border-[#2a2f3b] text-white rounded-xl transition-colors"
      >
        Agregar producto al inventario
      </button>

      <button
        disabled={!sede}
        onClick={() => router.push("/caja")}
        className="w-full mt-3 py-3 px-6 bg-[#141821] hover:bg-[#1e242f] disabled:opacity-40 border border-[#2a2f3b] text-white rounded-xl transition-colors"
      >
        Ver caja (ingresos)
      </button>

      {/* Controles admin */}
      {(session as any).esAdmin && (
        <div className="mt-8 pt-6 border-t border-[#2a2f3b]">
          <p className="text-xs text-muted mb-3 font-medium">Admin</p>

          <button
            onClick={inicializarHoja}
            disabled={inicializando}
            className="w-full py-2 px-4 bg-[#1e242f] hover:bg-[#2a2f3b] disabled:opacity-40 border border-[#2a2f3b] text-white text-sm rounded-lg transition-colors mb-2"
          >
            {inicializando
              ? "Creando hoja..."
              : "Inicializar hoja 'Inventario android 2026'"}
          </button>
          {mensajeInit && (
            <div className="mb-3 text-xs bg-[#0b0d12] border border-[#2a2f3b] rounded-lg p-3">
              <p className="text-white mb-2">{mensajeInit}</p>
              {detallesInit?.hojasDespues && (
                <p className="text-muted">
                  Pestañas después: {detallesInit.hojasDespues.join(" · ")}
                </p>
              )}
              {detallesInit?.logs && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted hover:text-white">
                    Ver logs técnicos
                  </summary>
                  <pre className="mt-2 text-[10px] text-muted whitespace-pre-wrap break-all">
                    {detallesInit.logs.join("\n")}
                  </pre>
                </details>
              )}
            </div>
          )}

          {sede && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${sede.libroId}/edit`}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-muted hover:text-white underline mb-3"
            >
              Abrir libro en Google Sheets →
            </a>
          )}

          <button
            onClick={() => router.push("/admin/limpiar")}
            className="w-full py-2 px-4 bg-red-950/50 hover:bg-red-900/50 border border-red-800 text-red-300 text-sm rounded-lg transition-colors mt-3"
          >
            🗑 Limpiar libro (borrar pestañas viejas)
          </button>

          <div className="flex flex-col items-center gap-2 mt-4">
            <a
              href="/admin/diagnostico"
              className="text-sm text-brand hover:text-brand-light underline font-medium"
            >
              Diagnóstico visual del inventario
            </a>
            <div className="flex gap-4 text-xs text-muted">
              <a
                href="/api/diag/clientes"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white underline"
              >
                JSON clientes
              </a>
              <a
                href="/api/diag/inventario"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white underline"
              >
                JSON inventario
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

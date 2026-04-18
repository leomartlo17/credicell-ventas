"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DiagnosticoVisual() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/diag/inventario")
      .then((r) => r.json())
      .then((d) => {
        if (d.error && !d.hojasDisponibles) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e?.message || "Error"))
      .finally(() => setCargando(false));
  }, [status]);

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-muted text-sm hover:text-white"
        >
          ← Dashboard
        </button>
        <div className="text-muted text-xs">Diagnóstico Inventario</div>
      </div>

      <h1 className="text-2xl font-bold mb-1">Diagnóstico visual del inventario</h1>
      <p className="text-muted text-sm mb-6">
        Esta página te muestra EXACTAMENTE lo que yo (el sistema) veo al leer
        tu hoja. Sirve para que Leonardo pueda tomar screenshot y enviármelo.
      </p>

      {cargando && <p className="text-muted">Cargando datos...</p>}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <Bloque titulo="Sede & Libro">
            <div className="text-sm">
              <div><span className="text-muted">Sede:</span> {data.sede}</div>
              <div><span className="text-muted">Libro ID:</span> <span className="font-mono text-xs">{data.libroId}</span></div>
              <div><span className="text-muted">Regla activa:</span> {data.reglas?.nota}</div>
            </div>
          </Bloque>

          <Bloque titulo={`Hojas del libro (${data.hojasDisponibles?.length || 0})`}>
            <div className="text-sm flex flex-wrap gap-2">
              {(data.hojasDisponibles || []).map((h: string) => (
                <span
                  key={h}
                  className={`px-2 py-1 rounded ${
                    data.hojasInventario?.includes(h)
                      ? "bg-brand text-[#0b0d12] font-bold"
                      : "bg-[#1e242f] text-muted"
                  }`}
                >
                  {h}
                </span>
              ))}
            </div>
            <div className="text-xs text-muted mt-2">
              Las resaltadas en naranja son las que considero "de inventario" (contienen la palabra INVENTARIO).
            </div>
          </Bloque>

          {data.hojas &&
            Object.entries(data.hojas).map(([nombre, info]: [string, any]) => (
              <Bloque key={nombre} titulo={`Hoja: "${nombre}" — primeras 30 filas`}>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs font-mono border-collapse">
                    <thead>
                      <tr className="border-b border-[#2a2f3b]">
                        <th className="px-2 py-1 text-left text-muted">#</th>
                        {Array.from({ length: Math.min(15, Math.max(...(info.filasConNumero || []).map((f: any) => f.valores?.length || 0))) }).map((_, i) => (
                          <th key={i} className="px-2 py-1 text-left text-muted">
                            {String.fromCharCode(65 + i)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(info.filasConNumero || []).map((fila: any) => (
                        <tr key={fila.row} className="border-b border-[#1e242f]">
                          <td className="px-2 py-1 text-muted">{fila.row}</td>
                          {(fila.valores || []).slice(0, 15).map((v: any, i: number) => (
                            <td key={i} className="px-2 py-1 max-w-[150px] truncate" title={String(v)}>
                              {String(v ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Bloque>
            ))}

          <Bloque titulo="Productos DISPONIBLES detectados (2026+)">
            {data.disponibles?.error ? (
              <div className="bg-red-950 border border-red-800 rounded p-3 text-red-300 text-sm">
                <strong>Error al listar disponibles:</strong><br />
                {data.disponibles.error}
              </div>
            ) : (
              <>
                <div className="text-sm mb-3">
                  <span className="text-brand font-bold">{data.disponibles?.total ?? 0}</span>{" "}
                  productos detectados como disponibles.
                </div>
                {data.disponibles?.muestra?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#2a2f3b] text-muted">
                          <th className="text-left p-2">Fila</th>
                          <th className="text-left p-2">Marca</th>
                          <th className="text-left p-2">Equipo</th>
                          <th className="text-left p-2">Color</th>
                          <th className="text-left p-2">IMEI</th>
                          <th className="text-left p-2">Fecha ingreso</th>
                          <th className="text-left p-2">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.disponibles.muestra.map((p: any) => (
                          <tr key={p.fila} className="border-b border-[#1e242f]">
                            <td className="p-2 text-muted">{p.fila}</td>
                            <td className="p-2">{p.marca}</td>
                            <td className="p-2">{p.equipo}</td>
                            <td className="p-2">{p.color}</td>
                            <td className="p-2 font-mono">{p.imei}</td>
                            <td className="p-2 text-muted">{p.fechaIngreso}</td>
                            <td className="p-2 text-muted">{p.estado}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Bloque>
        </div>
      )}
    </main>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4">
      <h2 className="text-sm font-bold mb-3 text-brand">{titulo}</h2>
      {children}
    </section>
  );
}

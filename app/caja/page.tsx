"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Periodo = "hoy" | "mes" | "30dias" | "todo";

type Resumen = {
  totalVentas: number;
  totalAbonado: number;
  pendienteFinanciera: number;
  contadorVentas: number;
  porMedio: Record<string, number>;
  porFinanciera: Record<string, number>;
  periodo: Periodo;
  desde: string | null;
  hasta: string | null;
  sede: string;
};

const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "30dias", etiqueta: "30 días" },
  { valor: "todo", etiqueta: "Todo 2026" },
];

export default function Caja() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  async function cargar(p: Periodo) {
    setCargando(true);
    setError("");
    try {
      const r = await fetch(`/api/caja/resumen?periodo=${p}`);
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Error");
        setResumen(null);
      } else {
        setResumen(data);
      }
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    cargar(periodo);
  }, [status, periodo]);

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  const fmt = (n: number) => `$${(n || 0).toLocaleString("es-CO")}`;

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
          onClick={() => cargar(periodo)}
          disabled={cargando}
          className="px-3 py-1 text-xs bg-[#141821] hover:bg-[#1e242f] border border-[#2a2f3b] text-muted hover:text-white rounded-lg"
        >
          ↻ Refrescar
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-1">Caja</h1>
      <p className="text-muted text-sm mb-4">
        Resumen de ingresos por medio de pago y por financiera.
      </p>

      {/* Selector de periodo */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {PERIODOS.map((p) => (
          <button
            key={p.valor}
            onClick={() => setPeriodo(p.valor)}
            className={`px-3 py-2 text-sm rounded-lg whitespace-nowrap ${
              periodo === p.valor
                ? "bg-brand text-[#0b0d12] font-bold"
                : "bg-[#141821] border border-[#2a2f3b] text-muted hover:text-white"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {cargando && <p className="text-muted text-sm">Cargando...</p>}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {resumen && !cargando && (
        <div className="space-y-4">
          {/* Cards totales */}
          <div className="grid grid-cols-2 gap-3">
            <Card
              titulo="Ventas totales"
              valor={fmt(resumen.totalVentas)}
              sub={`${resumen.contadorVentas} venta${resumen.contadorVentas === 1 ? "" : "s"}`}
              destacar
            />
            <Card
              titulo="Abonado hoy"
              valor={fmt(resumen.totalAbonado)}
              sub="Dinero efectivamente cobrado"
            />
          </div>

          {resumen.pendienteFinanciera > 0 && (
            <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-3 text-sm">
              <div className="text-muted text-xs mb-1">Financiado (pendiente)</div>
              <div className="text-white font-bold">
                {fmt(resumen.pendienteFinanciera)}
              </div>
              <div className="text-xs text-muted mt-1">
                = Ventas totales − Abonado. Lo que cubre la financiera.
              </div>
            </div>
          )}

          {/* Por medio de pago */}
          <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3 text-brand">Por medio de pago</h2>
            <div className="space-y-2">
              {Object.entries(resumen.porMedio)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([medio, monto]) => (
                  <Linea key={medio} etiqueta={medio} monto={fmt(monto)} />
                ))}
              {Object.values(resumen.porMedio).every((v) => v === 0) && (
                <p className="text-muted text-xs">
                  No hay ventas con medios de pago registrados en este período.
                </p>
              )}
            </div>
          </div>

          {/* Por financiera */}
          <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3 text-brand">Por financiera</h2>
            <div className="space-y-2">
              {Object.entries(resumen.porFinanciera)
                .sort(([, a], [, b]) => b - a)
                .map(([financiera, monto]) => (
                  <Linea
                    key={financiera}
                    etiqueta={financiera}
                    monto={fmt(monto)}
                  />
                ))}
              {Object.keys(resumen.porFinanciera).length === 0 && (
                <p className="text-muted text-xs">
                  No hay ventas en este período.
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted mt-4 text-center">
            Datos desde hoja "Ventas 2026" · Sede {resumen.sede}
            {resumen.desde && ` · desde ${resumen.desde}`}
          </p>
        </div>
      )}
    </main>
  );
}

function Card({
  titulo,
  valor,
  sub,
  destacar,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  destacar?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        destacar ? "bg-brand/10 border-brand" : "bg-[#141821] border-[#2a2f3b]"
      }`}
    >
      <div className="text-muted text-xs mb-1">{titulo}</div>
      <div className={`font-bold ${destacar ? "text-brand" : "text-white"}`}>
        {valor}
      </div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

function Linea({ etiqueta, monto }: { etiqueta: string; monto: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-[#1e242f] pb-1 last:border-b-0">
      <span className="text-muted">{etiqueta}</span>
      <span className="text-white font-mono">{monto}</span>
    </div>
  );
}

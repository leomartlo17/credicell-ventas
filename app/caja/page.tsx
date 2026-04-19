"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Periodo = "hoy" | "mes" | "30dias" | "todo";

type Mov = {
  fila: number;
  fecha: string;
  hora: string;
  tipo: "INGRESO" | "EGRESO";
  concepto: string;
  establecimiento: string;
  monto: number;
  saldoDespues: number;
  asesor: string;
  referencia: string;
  urlFactura: string;
  prestamoOtraSede: boolean;
  observaciones: string;
};

type Resumen = {
  totalVentas: number;
  totalAbonado: number;
  pendienteFinanciera: number;
  contadorVentas: number;
  porMedio: Record<string, number>;
  porFinanciera: Record<string, number>;
  periodo: Periodo;
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
  const [saldo, setSaldo] = useState<number | null>(null);
  const [movimientos, setMovimientos] = useState<Mov[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  async function cargar(p: Periodo) {
    setCargando(true);
    setError("");
    try {
      const [rResumen, rCaja] = await Promise.all([
        fetch(`/api/caja/resumen?periodo=${p}`),
        fetch(`/api/caja/movimientos`),
      ]);
      const dRes = await rResumen.json();
      const dCaja = await rCaja.json();
      if (!rResumen.ok) {
        setError(dRes.error || "Error resumen");
      } else {
        setResumen(dRes);
      }
      if (rCaja.ok) {
        setSaldo(dCaja.saldo);
        setMovimientos(dCaja.movimientos || []);
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
        Efectivo actual en la tienda, movimientos y resumen de ventas.
      </p>

      {/* SALDO ACTUAL EN EFECTIVO — tarjeta destacada */}
      <div className="bg-gradient-to-br from-brand/20 to-brand/5 border border-brand rounded-xl p-4 mb-4">
        <div className="text-xs text-muted mb-1">SALDO ACTUAL EN EFECTIVO</div>
        <div className="text-3xl font-bold text-brand mb-2">
          {saldo !== null ? fmt(saldo) : "..."}
        </div>
        <button
          onClick={() => router.push("/caja/egreso")}
          className="px-3 py-2 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-lg text-sm"
        >
          + Registrar egreso
        </button>
      </div>

      {/* ÚLTIMOS MOVIMIENTOS DE CAJA */}
      <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-3 text-brand">
          Últimos movimientos de caja
        </h2>
        {movimientos.length === 0 ? (
          <p className="text-muted text-xs">
            Aún no hay movimientos. Las ventas con efectivo entran automático,
            y los egresos se registran con el botón de arriba.
          </p>
        ) : (
          <ul className="space-y-2">
            {movimientos.slice(0, 10).map((m) => (
              <li
                key={m.fila}
                className="border-b border-[#1e242f] pb-2 last:border-b-0 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      m.tipo === "INGRESO"
                        ? "text-green-400 font-bold"
                        : "text-red-400 font-bold"
                    }
                  >
                    {m.tipo === "INGRESO" ? "+" : "−"} {fmt(m.monto)}
                  </span>
                  <span className="text-muted">{m.fecha} {m.hora}</span>
                </div>
                <div className="text-muted mt-1">
                  {m.concepto}
                  {m.establecimiento && ` · ${m.establecimiento}`}
                </div>
                {m.referencia && (
                  <div className="text-[10px] text-muted/70 mt-1">{m.referencia}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* RESUMEN DE VENTAS POR PERIODO */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
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

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {resumen && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card
              titulo="Ventas totales"
              valor={fmt(resumen.totalVentas)}
              sub={`${resumen.contadorVentas} venta${resumen.contadorVentas === 1 ? "" : "s"}`}
            />
            <Card
              titulo="Recibido en mano"
              valor={fmt(resumen.totalAbonado)}
              sub="Suma de medios de pago"
            />
          </div>

          {resumen.pendienteFinanciera > 0 && (
            <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-3 text-sm">
              <div className="text-muted text-xs mb-1">
                Financiado pendiente de pago de financieras
              </div>
              <div className="text-white font-bold">
                {fmt(resumen.pendienteFinanciera)}
              </div>
            </div>
          )}

          <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3 text-brand">
              Ingresos por medio de pago
            </h2>
            <div className="space-y-2">
              {Object.entries(resumen.porMedio)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([medio, monto]) => (
                  <Linea key={medio} etiqueta={medio} monto={fmt(monto)} />
                ))}
              {Object.values(resumen.porMedio).every((v) => v === 0) && (
                <p className="text-muted text-xs">Sin datos en este período.</p>
              )}
            </div>
          </div>

          <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3 text-brand">Por financiera</h2>
            <div className="space-y-2">
              {Object.entries(resumen.porFinanciera)
                .sort(([, a], [, b]) => b - a)
                .map(([f, monto]) => (
                  <Linea key={f} etiqueta={f} monto={fmt(monto)} />
                ))}
              {Object.keys(resumen.porFinanciera).length === 0 && (
                <p className="text-muted text-xs">Sin datos en este período.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({
  titulo,
  valor,
  sub,
}: {
  titulo: string;
  valor: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl p-3 border bg-[#141821] border-[#2a2f3b]">
      <div className="text-muted text-xs mb-1">{titulo}</div>
      <div className="font-bold text-white">{valor}</div>
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

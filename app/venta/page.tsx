"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Producto {
  fila: number;
  marca: string;
  equipo: string;
  imei1: string;
  imei2: string;
  color: string;
  precioCosto: number;
  estado: string;
  tipo: string;
}

interface Cliente {
  cedula: string;
  nombre: string;
  telefono: string;
}

interface Pago {
  financiera: string;
  valorVenta: number;
  inicial: number;
  cuota: number;
  porcentajeKupo: number;
}

type Paso = 1 | 2 | 3 | 4;

// ─── Constantes ───────────────────────────────────────────────────────────────

const FINANCIERAS = [
  "KREDIYA",
  "ADELANTOS",
  "+KUPO",
  "BOGOTA",
  "ADDI",
  "SU+PAY",
  "RENTING",
  "ALCANOS",
  "Contado",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCOP(n: number): string {
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

// Mínimo porcentaje que debe pagar el cliente para que +Kupo financie el resto
// (máximo que financia +Kupo: $3.000.000)
function calcularMinPctKupo(precio: number): number {
  if (precio <= 3_000_000) return 20;
  const min = Math.ceil(((precio - 3_000_000) / precio) * 100);
  return Math.min(80, Math.max(20, min));
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function VentaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [paso, setPaso] = useState<Paso>(1);
  const [cliente, setCliente] = useState<Cliente>({ cedula: "", nombre: "", telefono: "" });
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [productoSel, setProductoSel] = useState<Producto | null>(null);
  const [pago, setPago] = useState<Pago>({
    financiera: "",
    valorVenta: 0,
    inicial: 0,
    cuota: 0,
    porcentajeKupo: 20,
  });
  const [errPaso, setErrPaso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") cargarProductos();
  }, [status]);

  async function cargarProductos() {
    setLoadingProductos(true);
    try {
      const res = await fetch("/api/inventario");
      if (!res.ok) throw new Error();
      const data: Producto[] = await res.json();
      setProductos(data.filter((p) => p.estado === "Disponible"));
    } catch {
      // lista vacía — se muestra mensaje al usuario
    } finally {
      setLoadingProductos(false);
    }
  }

  // ── Estado derivado para +Kupo iPhone ──
  const esKupoIphone = pago.financiera === "+KUPO" && productoSel?.tipo === "iPhone";
  const precioRef = pago.valorVenta > 0 ? pago.valorVenta : productoSel?.precioCosto ?? 0;
  const minPct = calcularMinPctKupo(precioRef);
  const inicialKupo = esKupoIphone ? Math.round(precioRef * pago.porcentajeKupo / 100) : pago.inicial;
  const financiadoKupo = esKupoIphone ? precioRef - inicialKupo : 0;

  function setC(campo: keyof Cliente, val: string) {
    setCliente((prev) => ({ ...prev, [campo]: val }));
    setErrPaso("");
  }

  function setP(campo: keyof Pago, val: any) {
    setPago((prev) => ({ ...prev, [campo]: val }));
    setErrPaso("");
  }

  // ── Validaciones por paso ──

  function validarPaso1(): boolean {
    if (!cliente.cedula.trim()) { setErrPaso("La cédula es obligatoria"); return false; }
    if (!cliente.nombre.trim()) { setErrPaso("El nombre del cliente es obligatorio"); return false; }
    return true;
  }

  function validarPaso2(): boolean {
    if (!productoSel) { setErrPaso("Selecciona un producto del inventario"); return false; }
    return true;
  }

  function validarPaso3(): boolean {
    if (!pago.financiera) { setErrPaso("Selecciona la financiera"); return false; }
    if (pago.valorVenta <= 0) { setErrPaso("Ingresa el valor de venta"); return false; }
    if (pago.financiera !== "Contado") {
      if (esKupoIphone) {
        if (pago.porcentajeKupo < minPct) {
          setErrPaso(`Porcentaje mínimo para este precio: ${minPct}% (máximo que financia +Kupo: $3.000.000)`);
          return false;
        }
        if (financiadoKupo > 3_000_000) {
          setErrPaso("+Kupo tiene un máximo de $3.000.000. Sube el porcentaje inicial.");
          return false;
        }
      }
    }
    return true;
  }

  function avanzar() {
    setErrPaso("");
    if (paso === 1 && !validarPaso1()) return;
    if (paso === 2 && !validarPaso2()) return;
    if (paso === 3 && !validarPaso3()) return;
    setPaso((prev) => (prev + 1) as Paso);
  }

  function retroceder() {
    setErrPaso("");
    if (paso > 1) setPaso((prev) => (prev - 1) as Paso);
    else router.push("/dashboard");
  }

  async function confirmar() {
    setGuardando(true);
    setErrPaso("");
    try {
      const pagoFinal: Pago = esKupoIphone ? { ...pago, inicial: inicialKupo } : pago;

      const res = await fetch("/api/venta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente,
          producto: productoSel,
          pago: pagoFinal,
          filaInventario: productoSel?.fila,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar la venta");
      setExito(true);
    } catch (e: any) {
      setErrPaso(e.message);
    } finally {
      setGuardando(false);
    }
  }

  // ── Loading / no auth ──

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }
  if (!session) return null;

  // ── Pantalla de éxito ──

  if (exito) {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-green-900/50 border border-green-600 flex items-center justify-center mb-4 text-3xl font-bold text-green-400">
          ✓
        </div>
        <h2 className="text-xl font-bold mb-2">Venta registrada</h2>
        <p className="text-muted text-sm mb-1">
          {productoSel?.marca} {productoSel?.equipo} — {cliente.nombre}
        </p>
        <p className="text-muted text-sm mb-8">
          {pago.financiera} · {formatCOP(pago.valorVenta)}
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="w-full py-4 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-xl text-lg transition-colors"
        >
          Volver al inicio
        </button>
        <button
          onClick={() => {
            setExito(false);
            setPaso(1);
            setCliente({ cedula: "", nombre: "", telefono: "" });
            setProductoSel(null);
            setPago({ financiera: "", valorVenta: 0, inicial: 0, cuota: 0, porcentajeKupo: 20 });
            cargarProductos();
          }}
          className="w-full mt-3 py-3 border border-line rounded-xl text-muted hover:text-ink text-sm transition-colors"
        >
          Registrar otra venta
        </button>
      </main>
    );
  }

  // ── Formulario multi-paso ──

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={retroceder}
          className="p-2 rounded-lg bg-card border border-line text-muted hover:text-white transition-colors text-lg"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="font-bold">Nueva venta</h1>
          <p className="text-muted text-xs">Paso {paso} de 4</p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="flex gap-1.5 mb-6">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`flex-1 h-1 rounded-full transition-colors ${
              n <= paso ? "bg-brand" : "bg-line"
            }`}
          />
        ))}
      </div>

      {/* ── PASO 1: Cliente ── */}
      {paso === 1 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">
            Datos del cliente
          </h2>

          <div>
            <label className="text-muted text-xs block mb-1.5">Cédula *</label>
            <input
              type="text"
              inputMode="numeric"
              value={cliente.cedula}
              onChange={(e) => setC("cedula", e.target.value.replace(/\D/g, ""))}
              placeholder="1234567890"
              className="w-full bg-input border border-line rounded-xl px-4 py-3.5 text-ink placeholder:text-muted text-base"
            />
          </div>

          <div>
            <label className="text-muted text-xs block mb-1.5">Nombre completo *</label>
            <input
              type="text"
              value={cliente.nombre}
              onChange={(e) => setC("nombre", e.target.value)}
              placeholder="Juan García López"
              className="w-full bg-input border border-line rounded-xl px-4 py-3.5 text-ink placeholder:text-muted text-base"
            />
          </div>

          <div>
            <label className="text-muted text-xs block mb-1.5">Teléfono</label>
            <input
              type="text"
              inputMode="tel"
              value={cliente.telefono}
              onChange={(e) => setC("telefono", e.target.value.replace(/\D/g, ""))}
              placeholder="3001234567"
              className="w-full bg-input border border-line rounded-xl px-4 py-3.5 text-ink placeholder:text-muted text-base"
            />
          </div>
        </div>
      )}

      {/* ── PASO 2: Producto ── */}
      {paso === 2 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">
            Seleccionar producto
          </h2>

          {loadingProductos ? (
            <p className="text-muted text-sm text-center py-8">Cargando inventario...</p>
          ) : productos.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted text-sm mb-3">No hay productos disponibles en el inventario.</p>
              <button
                onClick={() => router.push("/inventario")}
                className="text-brand text-sm underline"
              >
                Ir a agregar productos
              </button>
            </div>
          ) : (
            productos.map((p) => (
              <button
                key={`${p.fila}-${p.imei1}`}
                onClick={() => {
                  setProductoSel(p);
                  setErrPaso("");
                }}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                  productoSel?.fila === p.fila
                    ? "border-brand bg-brand/10"
                    : "border-line bg-card hover:border-muted"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-ink">
                        {p.marca} {p.equipo}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 bg-line rounded text-muted">
                        {p.tipo || "Android"}
                      </span>
                    </div>
                    <p className="text-muted text-xs mt-1">
                      {p.color} · IMEI {p.imei1}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-ink shrink-0">
                    ${p.precioCosto.toLocaleString("es-CO")}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── PASO 3: Pago ── */}
      {paso === 3 && productoSel && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">
            Forma de pago
          </h2>

          {/* Resumen del producto */}
          <div className="p-3 bg-card border border-line rounded-xl">
            <p className="text-xs text-muted mb-0.5">Producto seleccionado</p>
            <p className="font-bold text-sm">
              {productoSel.marca} {productoSel.equipo}{" "}
              <span className="font-normal text-muted">· {productoSel.color}</span>
            </p>
            <p className="text-xs text-muted font-mono mt-0.5">{productoSel.imei1}</p>
          </div>

          {/* Selección de financiera */}
          <div>
            <label className="text-muted text-xs block mb-2">Financiera *</label>
            <div className="grid grid-cols-2 gap-2">
              {FINANCIERAS.map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setP("financiera", f);
                    // Resetear pago al cambiar financiera
                    setPago((prev) => ({ ...prev, financiera: f, inicial: 0, cuota: 0, porcentajeKupo: minPct }));
                  }}
                  className={`py-3 px-3 rounded-xl border text-sm font-medium transition-colors ${
                    pago.financiera === f
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-line bg-card text-muted hover:text-white hover:border-muted"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Campos de pago */}
          {pago.financiera && (
            <>
              {/* Valor de venta */}
              <div>
                <label className="text-muted text-xs block mb-1.5">Valor de venta *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={pago.valorVenta || ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setP("valorVenta", v);
                    // Recalcular mínimo de porcentaje Kupo al cambiar el precio
                    if (esKupoIphone) {
                      const newMin = calcularMinPctKupo(v);
                      if (pago.porcentajeKupo < newMin) setP("porcentajeKupo", newMin);
                    }
                  }}
                  placeholder="800000"
                  className="w-full bg-input border border-line rounded-xl px-4 py-3.5 text-ink placeholder:text-muted text-base"
                />
              </div>

              {/* +KUPO iPhone: formulario especial */}
              {esKupoIphone && pago.valorVenta > 0 && (
                <div className="p-4 bg-card border border-brand/40 rounded-xl space-y-4">
                  <p className="text-xs text-brand font-bold uppercase tracking-wider">
                    +Kupo · iPhone — Flujo especial
                  </p>

                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <label className="text-muted text-xs">
                        % que recibe Credicell (inicial)
                      </label>
                      <span className="text-brand font-bold text-lg">{pago.porcentajeKupo}%</span>
                    </div>
                    <input
                      type="range"
                      min={minPct}
                      max={80}
                      step={1}
                      value={pago.porcentajeKupo}
                      onChange={(e) => setP("porcentajeKupo", Number(e.target.value))}
                      className="w-full accent-brand"
                    />
                    <div className="flex justify-between text-xs text-muted mt-1">
                      <span>Mín {minPct}%</span>
                      <span>80%</span>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-line pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Credicell recibe (inicial):</span>
                      <span className="font-bold text-ink">{formatCOP(inicialKupo)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">+Kupo financia:</span>
                      <span
                        className={`font-bold ${
                          financiadoKupo > 3_000_000 ? "text-red-400" : "text-ink"
                        }`}
                      >
                        {formatCOP(financiadoKupo)}
                      </span>
                    </div>
                    {financiadoKupo > 3_000_000 ? (
                      <p className="text-red-400 text-xs">
                        +Kupo tiene un máximo de $3.000.000. Sube el porcentaje.
                      </p>
                    ) : (
                      <p className="text-green-400 text-xs">Financiación válida</p>
                    )}
                  </div>
                </div>
              )}

              {/* Flujo estándar: inicial y cuota (todo menos Contado y +Kupo iPhone) */}
              {!esKupoIphone && pago.financiera !== "Contado" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-muted text-xs block mb-1.5">Inicial</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={pago.inicial || ""}
                      onChange={(e) => setP("inicial", Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-input border border-line rounded-xl px-3 py-3.5 text-ink placeholder:text-muted"
                    />
                  </div>
                  <div>
                    <label className="text-muted text-xs block mb-1.5">Cuota</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={pago.cuota || ""}
                      onChange={(e) => setP("cuota", Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-input border border-line rounded-xl px-3 py-3.5 text-ink placeholder:text-muted"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PASO 4: Confirmar ── */}
      {paso === 4 && productoSel && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">
            Confirmar venta
          </h2>

          <div className="p-4 bg-card border border-line rounded-xl">
            <p className="text-xs text-muted mb-1">Cliente</p>
            <p className="font-bold">{cliente.nombre}</p>
            <p className="text-muted text-xs">
              CC {cliente.cedula}
              {cliente.telefono ? ` · ${cliente.telefono}` : ""}
            </p>
          </div>

          <div className="p-4 bg-card border border-line rounded-xl">
            <p className="text-xs text-muted mb-1">Producto</p>
            <p className="font-bold">
              {productoSel.marca} {productoSel.equipo}
            </p>
            <p className="text-muted text-xs">
              {productoSel.color} · {productoSel.tipo} · IMEI {productoSel.imei1}
            </p>
          </div>

          <div className="p-4 bg-card border border-line rounded-xl">
            <p className="text-xs text-muted mb-1">Pago</p>
            <p className="font-bold">
              {pago.financiera} — {formatCOP(pago.valorVenta)}
            </p>
            {esKupoIphone ? (
              <div className="text-muted text-xs mt-1 space-y-0.5">
                <p>Inicial ({pago.porcentajeKupo}%): {formatCOP(inicialKupo)}</p>
                <p>+Kupo financia: {formatCOP(financiadoKupo)}</p>
              </div>
            ) : pago.financiera !== "Contado" &&
              (pago.inicial > 0 || pago.cuota > 0) ? (
              <div className="text-muted text-xs mt-1 space-y-0.5">
                {pago.inicial > 0 && <p>Inicial: {formatCOP(pago.inicial)}</p>}
                {pago.cuota > 0 && <p>Cuota: {formatCOP(pago.cuota)}</p>}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Error del paso */}
      {errPaso && (
        <p className="mt-4 text-red-400 text-sm">{errPaso}</p>
      )}

      {/* Botón de acción */}
      <div className="mt-6">
        {paso < 4 ? (
          <button
            onClick={avanzar}
            disabled={paso === 2 && loadingProductos}
            className="w-full py-4 bg-brand hover:bg-brand-light disabled:opacity-50 text-[#0b0d12] font-bold rounded-xl text-lg transition-colors"
          >
            Continuar
          </button>
        ) : (
          <button
            onClick={confirmar}
            disabled={guardando}
            className="w-full py-4 bg-brand hover:bg-brand-light disabled:opacity-50 text-[#0b0d12] font-bold rounded-xl text-lg transition-colors"
          >
            {guardando ? "Guardando..." : "Confirmar venta"}
          </button>
        )}
      </div>
    </main>
  );
}

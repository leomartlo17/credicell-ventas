"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Producto {
  id: string;
  marca: string;
  equipo: string;
  color?: string;
  imei1?: string;
  tipoEquipo?: string;
  precioCosto?: number;
}

const FINANCIERAS = [
  { id: "contado", nombre: "Contado" },
  { id: "kupo", nombre: "+Kupo" },
  { id: "addi", nombre: "ADDI" },
  { id: "sistecredito", nombre: "Sistecrédito" },
  { id: "alkosto", nombre: "Alkosto" },
];

function calcularKupo(precio: number, porcentaje: number) {
  const cuotaInicial = Math.round(precio * (porcentaje / 100));
  const financiado = precio - cuotaInicial;
  return { cuotaInicial, financiado };
}

function minPorcentajeKupo(precio: number): number {
  if (precio <= 3000000) return 20;
  return Math.ceil(((precio - 3000000) / precio) * 100);
}

export default function VentaPage() {
  const router = useRouter();
  const [paso, setPaso] = useState(1);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null);
  const [financiera, setFinanciera] = useState("");
  const [precio, setPrecio] = useState("");
  const [porcentaje, setPorcentaje] = useState(20);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    fetch("/api/inventario/disponibles")
      .then((r) => r.json())
      .then((data) => {
        setProductos(data.productos || []);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, []);

  const productosFiltrados = productos.filter((p) => {
    const q = busqueda.toLowerCase();
    return (
      p.marca?.toLowerCase().includes(q) ||
      p.equipo?.toLowerCase().includes(q) ||
      p.color?.toLowerCase().includes(q) ||
      p.imei1?.includes(q)
    );
  });

  const precioNum = parseInt(precio.replace(/D/g, "")) || 0;
  const minPct = productoSeleccionado?.tipoEquipo === "iphone" ? minPorcentajeKupo(precioNum) : 20;
  const maxPct = 80;
  const { cuotaInicial, financiado } = calcularKupo(precioNum, porcentaje);

  const formatCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  useEffect(() => {
    if (porcentaje < minPct) setPorcentaje(minPct);
  }, [minPct]);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
            ←
          </button>
          <h1 className="text-xl font-bold text-gray-800">Nueva Venta</h1>
        </div>

        {paso === 1 && (
          <div>
            <h2 className="text-lg font-semibold mb-3 text-gray-700">Selecciona el producto</h2>
            <input
              type="text"
              placeholder="Buscar por marca, equipo, IMEI..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
            />
            {cargando ? (
              <p className="text-center text-gray-400 py-8">Cargando inventario...</p>
            ) : productosFiltrados.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No hay productos disponibles</p>
            ) : (
              <div className="space-y-2">
                {productosFiltrados.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setProductoSeleccionado(p); setPaso(2); }}
                    className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <div className="font-medium text-gray-800">{p.marca} {p.equipo}</div>
                    <div className="text-sm text-gray-500">
                      {p.color} {p.tipoEquipo ? `· ${p.tipoEquipo}` : ""} {p.imei1 ? `· IMEI: ${p.imei1}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {paso === 2 && productoSeleccionado && (
          <div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
              <div className="font-medium">{productoSeleccionado.marca} {productoSeleccionado.equipo}</div>
              <div className="text-sm text-gray-500">{productoSeleccionado.color} · {productoSeleccionado.tipoEquipo || "Sin tipo"}</div>
            </div>
            <h2 className="text-lg font-semibold mb-3 text-gray-700">Selecciona la financiera</h2>
            <div className="space-y-2">
              {FINANCIERAS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setFinanciera(f.id); setPaso(3); }}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:bg-blue-50 transition-colors font-medium text-gray-800"
                >
                  {f.nombre}
                </button>
              ))}
            </div>
            <button onClick={() => setPaso(1)} className="mt-4 text-sm text-gray-400 hover:text-gray-600">← Volver</button>
          </div>
        )}

        {paso === 3 && productoSeleccionado && (
          <div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
              <div className="font-medium">{productoSeleccionado.marca} {productoSeleccionado.equipo}</div>
              <div className="text-sm text-gray-500">{productoSeleccionado.color} · Financiera: {FINANCIERAS.find(f => f.id === financiera)?.nombre}</div>
            </div>

            {financiera === "kupo" && productoSeleccionado.tipoEquipo === "iphone" && (
              <div>
                <h2 className="text-lg font-semibold mb-3 text-gray-700">Calculadora +Kupo iPhone</h2>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                  +Kupo financia máximo $3.000.000. El porcentaje mínimo de cuota inicial depende del precio.
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio de venta</label>
                    <input
                      type="text"
                      placeholder="Ej: 7500000"
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    {precioNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(precioNum)}</p>}
                  </div>
                  {precioNum > 0 && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cuota inicial: {porcentaje}% (mín. {minPct}%)
                        </label>
                        <input
                          type="range"
                          min={minPct}
                          max={maxPct}
                          value={porcentaje}
                          onChange={(e) => setPorcentaje(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Cuota inicial ({porcentaje}%)</span>
                          <span className="font-semibold text-green-600">{formatCOP(cuotaInicial)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Financiado por +Kupo</span>
                          <span className={`font-semibold ${financiado > 3000000 ? "text-red-500" : "text-blue-600"}`}>
                            {formatCOP(financiado)}
                          </span>
                        </div>
                        {financiado > 3000000 && (
                          <p className="text-xs text-red-500 mt-1">⚠️ Excede el máximo de +Kupo ($3.000.000)</p>
                        )}
                        {financiado <= 3000000 && (
                          <p className="text-xs text-green-600 mt-1">✓ Dentro del límite de +Kupo</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {financiera === "kupo" && productoSeleccionado.tipoEquipo !== "iphone" && (
              <div>
                <h2 className="text-lg font-semibold mb-3 text-gray-700">+Kupo — Android / Otro</h2>
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio de venta</label>
                    <input
                      type="text"
                      placeholder="Ej: 2500000"
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    {precioNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(precioNum)}</p>}
                  </div>
                  {precioNum > 0 && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cuota inicial: {porcentaje}% (20%-80%)
                        </label>
                        <input
                          type="range"
                          min={20}
                          max={80}
                          value={porcentaje}
                          onChange={(e) => setPorcentaje(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Cuota inicial ({porcentaje}%)</span>
                          <span className="font-semibold text-green-600">{formatCOP(cuotaInicial)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Financiado por +Kupo</span>
                          <span className={`font-semibold ${financiado > 3000000 ? "text-red-500" : "text-blue-600"}`}>
                            {formatCOP(financiado)}
                          </span>
                        </div>
                        {financiado > 3000000 && (
                          <p className="text-xs text-red-500 mt-1">⚠️ Excede el máximo de +Kupo ($3.000.000)</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {financiera !== "kupo" && (
              <div>
                <h2 className="text-lg font-semibold mb-3 text-gray-700">
                  {FINANCIERAS.find(f => f.id === financiera)?.nombre}
                </h2>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-gray-500 text-sm">Ingresa el precio de venta para calcular.</p>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio de venta</label>
                    <input
                      type="text"
                      placeholder="Ej: 2500000"
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    {precioNum > 0 && (
                      <p className="text-sm font-semibold text-gray-700 mt-2">{formatCOP(precioNum)}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button onClick={() => setPaso(2)} className="mt-4 text-sm text-gray-400 hover:text-gray-600">← Volver</button>
          </div>
        )}
      </div>
    </div>
  );
}

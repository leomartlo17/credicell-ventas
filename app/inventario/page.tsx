"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TIPOS = ["Android", "iPhone", "Tablet", "Accesorio", "Otro"] as const;
type Tipo = (typeof TIPOS)[number];

interface Producto {
  fila: number;
  fechaIngreso: string;
  marca: string;
  equipo: string;
  imei1: string;
  imei2: string;
  color: string;
  precioCosto: number;
  fechaVenta: string;
  estado: string;
  proveedor: string;
  tipo: string;
}

const FORM_VACIO = {
  marca: "",
  equipo: "",
  imei1: "",
  imei2: "",
  color: "",
  precioCosto: "",
  proveedor: "",
  tipo: "Android" as Tipo,
};

export default function InventarioPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [exitoMsg, setExitoMsg] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") cargar();
  }, [status]);

  async function cargar() {
    setCargando(true);
    setErrorCarga("");
    try {
      const res = await fetch("/api/inventario");
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Error al cargar inventario");
      }
      setProductos(await res.json());
    } catch (e: any) {
      setErrorCarga(e.message);
    } finally {
      setCargando(false);
    }
  }

  function setF(campo: string, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    setFormError("");
  }

  async function guardar() {
    setFormError("");

    if (!form.marca.trim()) return setFormError("La marca es obligatoria");
    if (!form.equipo.trim()) return setFormError("El modelo del equipo es obligatorio");
    if (!form.imei1.trim()) return setFormError("El IMEI 1 es obligatorio");
    if (!/^\d{15}$/.test(form.imei1)) return setFormError("IMEI 1 debe tener exactamente 15 dígitos");
    if (form.imei2 && !/^\d{15}$/.test(form.imei2)) return setFormError("IMEI 2 debe tener exactamente 15 dígitos");
    if (!form.color.trim()) return setFormError("El color es obligatorio");
    if (!form.precioCosto || Number(form.precioCosto) <= 0) return setFormError("El precio de costo es obligatorio");

    setGuardando(true);
    try {
      const res = await fetch("/api/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, precioCosto: Number(form.precioCosto) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");

      setExitoMsg("Producto agregado al inventario");
      setForm(FORM_VACIO);
      setMostrarForm(false);
      cargar();
      setTimeout(() => setExitoMsg(""), 3000);
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setGuardando(false);
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

  const disponibles = productos.filter((p) => p.estado === "Disponible");
  const vendidos = productos.filter((p) => p.estado === "Vendido");

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="p-2 rounded-lg bg-card border border-line text-muted hover:text-white transition-colors text-lg"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-lg">Inventario</h1>
          <p className="text-muted text-xs">
            {disponibles.length} disponibles · {vendidos.length} vendidos
          </p>
        </div>
        <button
          onClick={() => {
            setMostrarForm((v) => !v);
            setFormError("");
          }}
          className="py-2 px-4 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-lg text-sm transition-colors"
        >
          + Agregar
        </button>
      </div>

      {/* Toast de éxito */}
      {exitoMsg && (
        <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-xl text-green-300 text-sm text-center">
          {exitoMsg}
        </div>
      )}

      {/* Formulario para agregar producto */}
      {mostrarForm && (
        <div className="mb-6 p-4 bg-card border border-line rounded-xl space-y-3">
          <h2 className="font-bold text-sm">Agregar producto al inventario</h2>

          {/* Tipo de equipo */}
          <div>
            <label className="text-muted text-xs block mb-1">Tipo de equipo *</label>
            <select
              value={form.tipo}
              onChange={(e) => setF("tipo", e.target.value)}
              className="w-full bg-input border border-line rounded-lg px-3 py-3 text-ink text-sm"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Marca y Equipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted text-xs block mb-1">Marca *</label>
              <input
                type="text"
                value={form.marca}
                onChange={(e) => setF("marca", e.target.value)}
                placeholder="Samsung, Apple..."
                className="w-full bg-input border border-line rounded-lg px-3 py-3 text-ink text-sm placeholder:text-muted"
              />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1">Equipo *</label>
              <input
                type="text"
                value={form.equipo}
                onChange={(e) => setF("equipo", e.target.value)}
                placeholder="A17, iPhone 14..."
                className="w-full bg-input border border-line rounded-lg px-3 py-3 text-ink text-sm placeholder:text-muted"
              />
            </div>
          </div>

          {/* IMEI 1 */}
          <div>
            <label className="text-muted text-xs block mb-1">IMEI 1 * (15 dígitos)</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.imei1}
              onChange={(e) => setF("imei1", e.target.value.replace(/\D/g, "").slice(0, 15))}
              placeholder="000000000000000"
              className="w-full bg-input border border-line rounded-lg px-3 py-3 text-ink text-sm font-mono placeholder:text-muted"
            />
            {form.imei1.length > 0 && form.imei1.length !== 15 && (
              <p className="text-yellow-400 text-xs mt-1">{form.imei1.length}/15 dígitos</p>
            )}
          </div>

          {/* IMEI 2 */}
          <div>
            <label className="text-muted text-xs block mb-1">IMEI 2 (opcional)</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.imei2}
              onChange={(e) => setF("imei2", e.target.value.replace(/\D/g, "").slice(0, 15))}
              placeholder="000000000000000"
              className="w-full bg-input border border-line rounded-lg px-3 py-3 text-ink text-sm font-mono placeholder:text-muted"
            />
          </div>

          {/* Color y Precio */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted text-xs block mb-1">Color *</label>
              <input
                type="text"
                value={form.color}
                onChange={(e) => setF("color", e.target.value)}
                placeholder="Negro, Blanco..."
                className="w-full bg-input border border-line rounded-lg px-3 py-3 text-ink text-sm placeholder:text-muted"
              />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1">Precio costo *</label>
              <input
                type="number"
                inputMode="numeric"
                value={form.precioCosto}
                onChange={(e) => setF("precioCosto", e.target.value)}
                placeholder="800000"
                className="w-full bg-input border border-line rounded-lg px-3 py-3 text-ink text-sm placeholder:text-muted"
              />
            </div>
          </div>

          {/* Proveedor */}
          <div>
            <label className="text-muted text-xs block mb-1">Proveedor</label>
            <input
              type="text"
              value={form.proveedor}
              onChange={(e) => setF("proveedor", e.target.value)}
              placeholder="Nombre del proveedor"
              className="w-full bg-input border border-line rounded-lg px-3 py-3 text-ink text-sm placeholder:text-muted"
            />
          </div>

          {formError && <p className="text-red-400 text-xs">{formError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                setMostrarForm(false);
                setFormError("");
                setForm(FORM_VACIO);
              }}
              className="flex-1 py-3 border border-line rounded-lg text-muted text-sm hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 py-3 bg-brand hover:bg-brand-light disabled:opacity-50 text-[#0b0d12] font-bold rounded-lg text-sm transition-colors"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* Lista de productos */}
      {cargando ? (
        <p className="text-muted text-sm text-center py-10">Cargando inventario...</p>
      ) : errorCarga ? (
        <div className="text-center py-10">
          <p className="text-red-400 text-sm mb-3">{errorCarga}</p>
          <button onClick={cargar} className="text-brand text-sm underline">
            Reintentar
          </button>
        </div>
      ) : productos.length === 0 ? (
        <p className="text-muted text-sm text-center py-10">
          No hay productos en el inventario.
        </p>
      ) : (
        <div className="space-y-2">
          {disponibles.map((p) => (
            <ProductoCard key={`${p.fila}-${p.imei1}`} p={p} />
          ))}
          {vendidos.length > 0 && (
            <>
              <p className="text-muted text-xs pt-4 pb-1 uppercase tracking-wider">
                Vendidos ({vendidos.length})
              </p>
              {vendidos.map((p) => (
                <ProductoCard key={`${p.fila}-${p.imei1}`} p={p} vendido />
              ))}
            </>
          )}
        </div>
      )}
    </main>
  );
}

function ProductoCard({ p, vendido }: { p: Producto; vendido?: boolean }) {
  return (
    <div
      className={`p-3 bg-card border rounded-xl transition-colors ${
        vendido ? "border-line opacity-60" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold text-sm ${vendido ? "line-through text-muted" : "text-ink"}`}>
              {p.marca} {p.equipo}
            </span>
            <span className="text-xs px-2 py-0.5 bg-line rounded-full text-muted shrink-0">
              {p.tipo || "Android"}
            </span>
          </div>
          <p className="text-muted text-xs mt-0.5">
            {p.color} · IMEI {p.imei1}
          </p>
          {p.fechaIngreso && (
            <p className="text-muted text-xs mt-0.5">Ingresó: {p.fechaIngreso}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-ink text-sm font-medium">
            ${p.precioCosto.toLocaleString("es-CO")}
          </p>
          <p className={`text-xs mt-0.5 ${vendido ? "text-muted" : "text-green-400"}`}>
            {p.estado || "Disponible"}
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Producto = {
  marca: string;
  equipo: string;
  color: string;
  imei: string;
  imei2?: string;
  precioCosto?: number;
  estado?: string;
  fila: number;
};

type Opciones = {
  marcas: string[];
  equiposPorMarca: Record<string, string[]>;
  colores: string[];
};

export default function Paso2Wrapper() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-sm">Cargando...</p>
        </main>
      }
    >
      <Paso2Producto />
    </Suspense>
  );
}

function Paso2Producto() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cedula = searchParams.get("cedula") || "";

  const [productos, setProductos] = useState<Producto[]>([]);
  const [opciones, setOpciones] = useState<Opciones>({
    marcas: [],
    equiposPorMarca: {},
    colores: [],
  });
  const [marca, setMarca] = useState("");
  const [equipo, setEquipo] = useState("");
  const [color, setColor] = useState("");
  const [imeiBuscar, setImeiBuscar] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!cedula) {
      setError("Falta la cédula del cliente. Vuelve al Paso 1.");
      setCargando(false);
      return;
    }
    cargar();
  }, [status, cedula, marca, equipo, color]);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (marca) qs.set("marca", marca);
      if (equipo) qs.set("equipo", equipo);
      if (color) qs.set("color", color);
      const r = await fetch(`/api/producto/disponibles?${qs.toString()}`);
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Error cargando inventario");
        setProductos([]);
      } else {
        setProductos(data.productos);
        setOpciones(data.opciones);
      }
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setCargando(false);
    }
  }

  async function buscarImei() {
    const limpio = imeiBuscar.replace(/\D/g, "");
    if (limpio.length !== 15) {
      setError(`IMEI debe ser 15 dígitos. Tienes ${limpio.length}.`);
      return;
    }
    setError("");
    setCargando(true);
    try {
      const r = await fetch(`/api/producto/buscar-imei?imei=${limpio}`);
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Error buscando IMEI");
        return;
      }
      if (!data.encontrado) {
        setError(`IMEI ${limpio} no existe en inventario`);
        return;
      }
      // Seleccionar directo y avanzar
      seleccionar(data.producto);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setCargando(false);
    }
  }

  function seleccionar(p: Producto) {
    router.push(
      `/venta/paso3?cedula=${cedula}&imei=${p.imei}&fila=${p.fila}`
    );
  }

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  const equiposDisponibles = marca
    ? opciones.equiposPorMarca[marca] || []
    : Object.values(opciones.equiposPorMarca).flat();

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/venta/paso1`)}
          className="text-muted text-sm hover:text-white"
        >
          ← Paso 1
        </button>
        <div className="text-muted text-xs">CC: {cedula}</div>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Paso 2 · Producto</h1>
          <p className="text-muted text-sm">
            Busca por IMEI o filtra el inventario disponible.
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          title="Refrescar inventario desde Google Sheets"
          className="px-3 py-2 text-xs bg-[#141821] hover:bg-[#1e242f] border border-[#2a2f3b] text-muted hover:text-white rounded-lg"
        >
          ↻ Refrescar
        </button>
      </div>

      {/* Atajo: IMEI directo */}
      <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4 mb-6">
        <label className="block text-xs text-muted mb-2">
          Atajo — IMEI directo (15 dígitos)
        </label>
        <div className="flex gap-2">
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            value={imeiBuscar}
            onChange={(e) =>
              setImeiBuscar(e.target.value.replace(/\D/g, "").slice(0, 15))
            }
            onKeyDown={(e) => e.key === "Enter" && buscarImei()}
            placeholder="123456789012345"
            className="flex-1 px-4 py-3 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand font-mono"
          />
          <button
            onClick={buscarImei}
            disabled={imeiBuscar.length !== 15}
            className="px-5 py-3 bg-brand hover:bg-brand-light disabled:opacity-40 text-[#0b0d12] font-bold rounded-lg"
          >
            Ir
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Select
          label="Marca"
          value={marca}
          onChange={(v) => {
            setMarca(v);
            setEquipo("");
          }}
          options={opciones.marcas}
        />
        <Select
          label="Equipo"
          value={equipo}
          onChange={setEquipo}
          options={equiposDisponibles}
        />
        <Select
          label="Color"
          value={color}
          onChange={setColor}
          options={opciones.colores}
        />
      </div>

      {(marca || equipo || color) && (
        <button
          onClick={() => {
            setMarca("");
            setEquipo("");
            setColor("");
          }}
          className="text-xs text-muted hover:text-white mb-4"
        >
          Limpiar filtros
        </button>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="text-muted text-sm text-center py-10">Cargando inventario...</p>
      ) : productos.length === 0 ? (
        <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-6 text-center">
          <p className="text-white font-medium mb-2">
            No hay productos disponibles
          </p>
          <p className="text-muted text-sm mb-4">
            {marca || equipo || color
              ? "Ningún equipo coincide con esos filtros. Limpia los filtros o agrega un producto nuevo."
              : "El inventario está vacío. Carga equipos primero para poder venderlos."}
          </p>
          <button
            onClick={() => router.push("/inventario/nuevo")}
            className="px-4 py-2 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-lg text-sm"
          >
            + Agregar producto al inventario
          </button>
        </div>
      ) : (
        <ListaAgrupada productos={productos} onSeleccionar={seleccionar} />
      )}
    </main>
  );
}

/**
 * Agrupa productos por marca+equipo+color y muestra "X disponibles" por grupo.
 * Al clic en un grupo se expande mostrando los IMEIs individuales.
 */
function ListaAgrupada({
  productos,
  onSeleccionar,
}: {
  productos: Producto[];
  onSeleccionar: (p: Producto) => void;
}) {
  const [expandido, setExpandido] = useState<string | null>(null);

  type Grupo = { key: string; marca: string; equipo: string; color: string; items: Producto[] };
  const grupos: Grupo[] = [];
  const map = new Map<string, Grupo>();
  for (const p of productos) {
    const key = `${p.marca}__${p.equipo}__${p.color || ""}`;
    if (!map.has(key)) {
      const g: Grupo = {
        key,
        marca: p.marca,
        equipo: p.equipo,
        color: p.color,
        items: [],
      };
      map.set(key, g);
      grupos.push(g);
    }
    map.get(key)!.items.push(p);
  }

  return (
    <div>
      <div className="text-xs text-muted mb-2">
        {grupos.length} modelo{grupos.length === 1 ? "" : "s"} · {productos.length}{" "}
        equipo{productos.length === 1 ? "" : "s"} total
      </div>
      <ul className="space-y-2">
        {grupos.map((g) => {
          const abierto = expandido === g.key;
          return (
            <li
              key={g.key}
              className="bg-[#141821] border border-[#2a2f3b] rounded-lg overflow-hidden"
            >
              <button
                className="w-full p-3 flex items-center justify-between hover:bg-[#1e242f] transition-colors text-left"
                onClick={() => setExpandido(abierto ? null : g.key)}
              >
                <div>
                  <div className="font-medium">
                    {g.marca} · {g.equipo}
                  </div>
                  <div className="text-xs text-muted">
                    {g.color && <>{g.color} · </>}
                    <span className="text-brand font-medium">
                      {g.items.length} disponible{g.items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="text-muted">{abierto ? "▾" : "▸"}</div>
              </button>
              {abierto && (
                <ul className="border-t border-[#2a2f3b]">
                  {g.items.map((p) => (
                    <li
                      key={p.fila}
                      className="p-3 pl-6 flex items-center justify-between hover:bg-[#1e242f] cursor-pointer border-b border-[#2a2f3b] last:border-b-0"
                      onClick={() => onSeleccionar(p)}
                    >
                      <div className="font-mono text-sm">{p.imei}</div>
                      <div className="text-brand text-sm font-bold">Seleccionar →</div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
      >
        <option value="">Todas</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

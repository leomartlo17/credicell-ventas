"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Catalogo = {
  marcas: string[];
  equiposPorMarca: Record<string, string[]>;
  colores: string[];
  proveedores: string[];
};

const NUEVO = "__NUEVO__"; // valor especial para "crear nueva entrada"

export default function NuevoProducto() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [catalogo, setCatalogo] = useState<Catalogo>({
    marcas: [],
    equiposPorMarca: {},
    colores: [],
    proveedores: [],
  });
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);

  const [tipoEquipo, setTipoEquipo] = useState("Android");
  const esIphone = tipoEquipo === "iPhone";

  const [form, setForm] = useState({
    marca: "",
    marcaNueva: "",
    equipo: "",
    equipoNuevo: "",
    color: "",
    colorNuevo: "",
    imei1: "",
    imei2: "",
    precioCosto: "",
    proveedor: "",
    proveedorNuevo: "",
  });

  const [estado, setEstado] = useState<
    | { tipo: "inicial" }
    | { tipo: "guardando" }
    | { tipo: "ok"; mensaje: string }
    | { tipo: "error"; mensaje: string }
  >({ tipo: "inicial" });

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/catalogo")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setCatalogo(d);
      })
      .finally(() => setCargandoCatalogo(false));
  }, [status]);

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  function actualizar(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // Marca final: iPhone siempre es Apple; otros usan el dropdown/nuevo
  const marcaFinal = esIphone
    ? "Apple"
    : form.marca === NUEVO ? form.marcaNueva.trim() : form.marca;
  const equipoFinal =
    form.equipo === NUEVO ? form.equipoNuevo.trim() : form.equipo;
  const colorFinal =
    form.color === NUEVO ? form.colorNuevo.trim() : form.color;
  const proveedorFinal =
    form.proveedor === NUEVO ? form.proveedorNuevo.trim() : form.proveedor;

  // Equipos que aparecen en el dropdown según la marca elegida
  const equiposDisponibles = marcaFinal
    ? catalogo.equiposPorMarca[marcaFinal] || []
    : [];

  async function guardar() {
    if (!esIphone && !marcaFinal) {
      setEstado({ tipo: "error", mensaje: "Selecciona o crea una marca" });
      return;
    }
    if (!equipoFinal) {
      setEstado({ tipo: "error", mensaje: "Selecciona o crea un equipo" });
      return;
    }
    const imei1 = form.imei1.replace(/\D/g, "");
    if (imei1.length !== 15) {
      setEstado({
        tipo: "error",
        mensaje: `IMEI 1 debe ser 15 dígitos (tienes ${imei1.length})`,
      });
      return;
    }
    const imei2 = form.imei2.replace(/\D/g, "");
    if (form.imei2 && imei2.length !== 15) {
      setEstado({
        tipo: "error",
        mensaje: `IMEI 2 debe ser 15 dígitos (tienes ${imei2.length})`,
      });
      return;
    }

    setEstado({ tipo: "guardando" });
    try {
      const r = await fetch("/api/producto/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marca: marcaFinal,
          equipo: equipoFinal,
          tipoEquipo: tipoEquipo || undefined,
          color: colorFinal || undefined,
          imei1,
          imei2: imei2 || undefined,
          precioCosto: form.precioCosto ? Number(form.precioCosto) : undefined,
          proveedor: proveedorFinal || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setEstado({ tipo: "error", mensaje: data.error || "Error al guardar" });
        return;
      }
      setEstado({
        tipo: "ok",
        mensaje: `Guardado: ${marcaFinal} ${equipoFinal} · IMEI ${imei1}`,
      });
      // Limpiar solo IMEIs. Marca/equipo/color se mantienen en el form para
      // que el asesor pueda seguir cargando unidades del mismo modelo.
      setForm((f) => ({ ...f, imei1: "", imei2: "" }));

      // Refrescar el catálogo: si acaba de crear marca/equipo/color nuevo,
      // aparecerá en los dropdowns al volver a abrir.
      fetch("/api/catalogo")
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) {
            setCatalogo(d);
            // Migrar el form de "nuevo" a "seleccionado" ahora que existe
            setForm((f) => ({
              ...f,
              marca: marcaFinal,
              marcaNueva: "",
              equipo: equipoFinal,
              equipoNuevo: "",
              color: colorFinal || f.color,
              colorNuevo: "",
              proveedor: proveedorFinal || f.proveedor,
              proveedorNuevo: "",
            }));
          }
        });
    } catch (e: any) {
      setEstado({ tipo: "error", mensaje: e?.message || "Error de red" });
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-muted text-sm hover:text-white"
        >
          ← Dashboard
        </button>
        <div className="text-muted text-xs">{(session as any).sede?.nombre}</div>
      </div>

      <h1 className="text-2xl font-bold mb-1">Agregar producto al inventario</h1>
      <p className="text-muted text-sm mb-6">
        Selecciona marca y equipo de la lista para que no haya duplicados por
        errores de escritura. Si es un modelo nuevo, usa "+ Crear nueva...".
      </p>

      <div className="space-y-3">
        {/* TIPO DE EQUIPO */}
        <div>
          <label className="block text-xs text-muted mb-1">Tipo de equipo *</label>
          <select
            value={tipoEquipo}
            onChange={(e) => setTipoEquipo(e.target.value)}
            className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
          >
            {["Android", "iPhone", "Tablet", "Accesorio", "Otro"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* MARCA — oculta para iPhone (siempre Apple) */}
        {esIphone ? (
          <div className="px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-muted text-sm">
            Marca: <span className="text-white font-medium">Apple</span> (automático)
          </div>
        ) : (
          <div>
            <label className="block text-xs text-muted mb-1">Marca *</label>
            <select
              value={form.marca}
              onChange={(e) => {
                const v = e.target.value;
                actualizar("marca", v);
                setForm((f) => ({
                  ...f,
                  marca: v,
                  equipo: "",
                  equipoNuevo: "",
                }));
              }}
              className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
            >
              <option value="">
                {cargandoCatalogo ? "Cargando..." : "-- Seleccionar --"}
              </option>
              {catalogo.marcas.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={NUEVO}>+ Crear nueva marca...</option>
            </select>
            {form.marca === NUEVO && (
              <input
                type="text"
                placeholder="Nombre de la nueva marca (ej: Xiaomi)"
                value={form.marcaNueva}
                onChange={(e) => actualizar("marcaNueva", e.target.value)}
                className="mt-2 w-full px-3 py-2 bg-[#0b0d12] border border-yellow-700 rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-yellow-500 text-sm"
              />
            )}
          </div>
        )}

        {/* EQUIPO */}
        <div>
          <label className="block text-xs text-muted mb-1">Equipo / Modelo *</label>
          <select
            value={form.equipo}
            onChange={(e) => actualizar("equipo", e.target.value)}
            disabled={!marcaFinal}
            className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm disabled:opacity-40"
          >
            <option value="">
              {!marcaFinal
                ? "Selecciona marca primero"
                : "-- Seleccionar --"}
            </option>
            {equiposDisponibles.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
            {marcaFinal && <option value={NUEVO}>+ Crear nuevo equipo...</option>}
          </select>
          {form.equipo === NUEVO && (
            <>
              <input
                type="text"
                placeholder="Modelo exacto (ej: A17 5G)"
                value={form.equipoNuevo}
                onChange={(e) => actualizar("equipoNuevo", e.target.value)}
                className="mt-2 w-full px-3 py-2 bg-[#0b0d12] border border-yellow-700 rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-yellow-500 text-sm"
              />
              <p className="text-xs text-yellow-400 mt-1">
                ⚠ "Samsung A17" y "Samsung A17 5G" son diferentes. Escríbelo
                como venga en la caja.
              </p>
            </>
          )}
        </div>

        {/* COLOR */}
        <div>
          <label className="block text-xs text-muted mb-1">Color</label>
          <select
            value={form.color}
            onChange={(e) => actualizar("color", e.target.value)}
            className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
          >
            <option value="">-- Sin especificar --</option>
            {catalogo.colores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={NUEVO}>+ Nuevo color...</option>
          </select>
          {form.color === NUEVO && (
            <input
              type="text"
              placeholder="Color nuevo"
              value={form.colorNuevo}
              onChange={(e) => actualizar("colorNuevo", e.target.value)}
              className="mt-2 w-full px-3 py-2 bg-[#0b0d12] border border-yellow-700 rounded-lg text-white focus:outline-none focus:border-yellow-500 text-sm"
            />
          )}
        </div>

        {/* IMEI 1 */}
        <div>
          <label className="block text-xs text-muted mb-1">IMEI 1 * (15 dígitos, único)</label>
          <input
            type="tel"
            inputMode="numeric"
            value={form.imei1}
            onChange={(e) =>
              actualizar("imei1", e.target.value.replace(/\D/g, "").slice(0, 15))
            }
            className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm font-mono"
          />
        </div>

        {/* IMEI 2 */}
        <div>
          <label className="block text-xs text-muted mb-1">IMEI 2 (opcional, dual SIM)</label>
          <input
            type="tel"
            inputMode="numeric"
            value={form.imei2}
            onChange={(e) =>
              actualizar("imei2", e.target.value.replace(/\D/g, "").slice(0, 15))
            }
            className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm font-mono"
          />
        </div>

        {/* PRECIO COSTO */}
        <div>
          <label className="block text-xs text-muted mb-1">Precio costo</label>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="850000"
            value={form.precioCosto}
            onChange={(e) =>
              actualizar("precioCosto", e.target.value.replace(/[^\d]/g, ""))
            }
            className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm"
          />
        </div>

        {/* PROVEEDOR */}
        <div>
          <label className="block text-xs text-muted mb-1">Proveedor</label>
          <select
            value={form.proveedor}
            onChange={(e) => actualizar("proveedor", e.target.value)}
            className="w-full px-3 py-2 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white focus:outline-none focus:border-brand text-sm"
          >
            <option value="">-- Sin especificar --</option>
            {catalogo.proveedores.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value={NUEVO}>+ Nuevo proveedor...</option>
          </select>
          {form.proveedor === NUEVO && (
            <input
              type="text"
              placeholder="Nombre del proveedor nuevo"
              value={form.proveedorNuevo}
              onChange={(e) => actualizar("proveedorNuevo", e.target.value)}
              className="mt-2 w-full px-3 py-2 bg-[#0b0d12] border border-yellow-700 rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-yellow-500 text-sm"
            />
          )}
        </div>
      </div>

      <button
        onClick={guardar}
        disabled={estado.tipo === "guardando"}
        className="w-full mt-6 py-3 bg-brand hover:bg-brand-light disabled:opacity-40 text-[#0b0d12] font-bold rounded-lg"
      >
        {estado.tipo === "guardando" ? "Guardando..." : "Guardar producto"}
      </button>

      {estado.tipo === "ok" && (
        <div className="mt-4 bg-[#141821] border border-green-800 rounded-xl p-3 text-green-300 text-sm">
          ✓ {estado.mensaje}
          <div className="text-xs text-muted mt-1">
            Los IMEIs se limpiaron. La marca, equipo y color se quedan para
            seguir agregando rápido.
          </div>
        </div>
      )}
      {estado.tipo === "error" && (
        <div className="mt-4 bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm">
          <strong>Error:</strong> {estado.mensaje}
        </div>
      )}
    </main>
  );
}

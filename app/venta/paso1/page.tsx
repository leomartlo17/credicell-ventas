"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Cliente = {
  cedula: string;
  nombre: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  email?: string;
  fechaNacimiento?: string;
  ocupacion?: string;
};

type Estado =
  | { tipo: "inicial" }
  | { tipo: "buscando" }
  | { tipo: "encontrado"; cliente: Cliente }
  | { tipo: "no-encontrado"; cedulaBuscada: string }
  | { tipo: "creando" }
  | { tipo: "creado"; cliente: Cliente }
  | { tipo: "error"; mensaje: string };

export default function Paso1Cliente() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [cedula, setCedula] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });
  const [formNuevo, setFormNuevo] = useState({
    nombre: "",
    telefono: "",
    direccion: "",
    ciudad: "",
    email: "",
    ocupacion: "",
  });

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }
  if (!session) return null;

  async function buscar() {
    const cedulaLimpia = cedula.replace(/\D/g, "");
    if (cedulaLimpia.length < 5) {
      setEstado({ tipo: "error", mensaje: "Cédula muy corta" });
      return;
    }
    setEstado({ tipo: "buscando" });
    try {
      const r = await fetch(`/api/cliente/buscar?cedula=${cedulaLimpia}`);
      const data = await r.json();
      if (!r.ok) {
        setEstado({ tipo: "error", mensaje: data.error || "Error buscando" });
        return;
      }
      if (data.encontrado) {
        setEstado({ tipo: "encontrado", cliente: data.cliente });
      } else {
        setEstado({ tipo: "no-encontrado", cedulaBuscada: cedulaLimpia });
      }
    } catch (e: any) {
      setEstado({ tipo: "error", mensaje: e?.message || "Error de red" });
    }
  }

  async function crear() {
    if (estado.tipo !== "no-encontrado") return;
    if (!formNuevo.nombre.trim()) {
      setEstado({ tipo: "error", mensaje: "El nombre es obligatorio" });
      return;
    }
    setEstado({ tipo: "creando" });
    try {
      const r = await fetch("/api/cliente/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedula: estado.cedulaBuscada,
          ...formNuevo,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setEstado({ tipo: "error", mensaje: data.error || "Error creando" });
        return;
      }
      setEstado({
        tipo: "creado",
        cliente: { cedula: estado.cedulaBuscada, ...formNuevo },
      });
    } catch (e: any) {
      setEstado({ tipo: "error", mensaje: e?.message || "Error de red" });
    }
  }

  const sede = (session as any).sede;

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-muted text-sm hover:text-white"
        >
          ← Volver
        </button>
        <div className="text-muted text-xs">{sede?.nombre || ""}</div>
      </div>

      <h1 className="text-2xl font-bold mb-1">Paso 1 · Cliente</h1>
      <p className="text-muted text-sm mb-8">
        Busca por cédula. Si no existe, lo creas ahora.
      </p>

      {/* Input de búsqueda — siempre visible */}
      <div className="mb-6">
        <label className="block text-sm text-muted mb-2">Cédula</label>
        <div className="flex gap-2">
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            value={cedula}
            onChange={(e) =>
              setCedula(e.target.value.replace(/\D/g, "").slice(0, 12))
            }
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="1234567890"
            className="flex-1 px-4 py-3 bg-[#141821] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand"
          />
          <button
            onClick={buscar}
            disabled={estado.tipo === "buscando"}
            className="px-5 py-3 bg-brand hover:bg-brand-light disabled:opacity-40 text-[#0b0d12] font-bold rounded-lg transition-colors"
          >
            {estado.tipo === "buscando" ? "..." : "Buscar"}
          </button>
        </div>
      </div>

      {/* Resultado: encontrado */}
      {estado.tipo === "encontrado" && (
        <div className="bg-[#141821] border border-green-800 rounded-xl p-4 mb-6">
          <div className="text-green-400 text-xs mb-2">CLIENTE ENCONTRADO</div>
          <div className="font-bold text-lg mb-1">{estado.cliente.nombre}</div>
          <div className="text-sm text-muted space-y-1">
            <div>CC: {estado.cliente.cedula}</div>
            {estado.cliente.telefono && <div>Tel: {estado.cliente.telefono}</div>}
            {estado.cliente.direccion && <div>Dir: {estado.cliente.direccion}</div>}
            {estado.cliente.ciudad && <div>Ciudad: {estado.cliente.ciudad}</div>}
          </div>
          <button
            className="w-full mt-4 py-3 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-lg"
            onClick={() => alert("Siguiente paso (Producto) — próxima fase")}
          >
            Siguiente: Producto →
          </button>
        </div>
      )}

      {/* Resultado: no encontrado → formulario */}
      {estado.tipo === "no-encontrado" && (
        <div className="bg-[#141821] border border-yellow-800 rounded-xl p-4 mb-6">
          <div className="text-yellow-400 text-xs mb-1">CLIENTE NUEVO</div>
          <p className="text-sm text-muted mb-4">
            Cédula <strong className="text-white">{estado.cedulaBuscada}</strong>{" "}
            no existe. Llena los datos para registrarlo.
          </p>
          <div className="space-y-3">
            <Campo
              label="Nombre completo *"
              value={formNuevo.nombre}
              onChange={(v) => setFormNuevo({ ...formNuevo, nombre: v })}
            />
            <Campo
              label="Teléfono / Celular"
              value={formNuevo.telefono}
              onChange={(v) => setFormNuevo({ ...formNuevo, telefono: v })}
              type="tel"
            />
            <Campo
              label="Dirección"
              value={formNuevo.direccion}
              onChange={(v) => setFormNuevo({ ...formNuevo, direccion: v })}
            />
            <Campo
              label="Ciudad"
              value={formNuevo.ciudad}
              onChange={(v) => setFormNuevo({ ...formNuevo, ciudad: v })}
            />
            <Campo
              label="Ocupación"
              value={formNuevo.ocupacion}
              onChange={(v) => setFormNuevo({ ...formNuevo, ocupacion: v })}
            />
          </div>
          <button
            onClick={crear}
            className="w-full mt-4 py-3 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-lg"
          >
            Crear cliente
          </button>
        </div>
      )}

      {estado.tipo === "creando" && (
        <div className="text-muted text-sm">Guardando en Google Sheets...</div>
      )}

      {estado.tipo === "creado" && (
        <div className="bg-[#141821] border border-green-800 rounded-xl p-4 mb-6">
          <div className="text-green-400 text-xs mb-2">✓ CLIENTE GUARDADO</div>
          <div className="font-bold text-lg mb-1">{estado.cliente.nombre}</div>
          <div className="text-sm text-muted">CC: {estado.cliente.cedula}</div>
          <button
            className="w-full mt-4 py-3 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-lg"
            onClick={() => alert("Siguiente paso (Producto) — próxima fase")}
          >
            Siguiente: Producto →
          </button>
        </div>
      )}

      {estado.tipo === "error" && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
          <strong>Error:</strong> {estado.mensaje}
        </div>
      )}
    </main>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm"
      />
    </div>
  );
}

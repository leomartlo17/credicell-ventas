"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function NuevoProducto() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [form, setForm] = useState({
    marca: "",
    equipo: "",
    color: "",
    imei1: "",
    imei2: "",
    precioCosto: "",
    proveedor: "",
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

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  function actualizar(campo: string, valor: string) {
    setForm({ ...form, [campo]: valor });
  }

  async function guardar() {
    // Validar mínimos aquí mismo para dar feedback rápido
    if (!form.marca.trim() || !form.equipo.trim()) {
      setEstado({ tipo: "error", mensaje: "Marca y Equipo son obligatorios" });
      return;
    }
    const imei1 = form.imei1.replace(/\D/g, "");
    if (imei1.length !== 15) {
      setEstado({ tipo: "error", mensaje: `IMEI 1 debe ser 15 dígitos (tienes ${imei1.length})` });
      return;
    }
    const imei2 = form.imei2.replace(/\D/g, "");
    if (form.imei2 && imei2.length !== 15) {
      setEstado({ tipo: "error", mensaje: `IMEI 2 debe ser 15 dígitos (tienes ${imei2.length})` });
      return;
    }

    setEstado({ tipo: "guardando" });
    try {
      const r = await fetch("/api/producto/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marca: form.marca.trim(),
          equipo: form.equipo.trim(),
          color: form.color.trim() || undefined,
          imei1,
          imei2: imei2 || undefined,
          precioCosto: form.precioCosto ? Number(form.precioCosto) : undefined,
          proveedor: form.proveedor.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setEstado({ tipo: "error", mensaje: data.error || "Error al guardar" });
        return;
      }
      setEstado({
        tipo: "ok",
        mensaje: `Guardado: ${form.marca} ${form.equipo} · IMEI ${imei1}`,
      });
      // Limpiar solo los IMEIs para seguir agregando el mismo modelo
      setForm({ ...form, imei1: "", imei2: "" });
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
        Si ya existe el IMEI, el sistema lo rechaza. Marca y Equipo se guardan
        tal cual los escribas — <strong>"Samsung A17" y "Samsung A17 5G" son
        diferentes</strong>, no los mezcles.
      </p>

      <div className="space-y-3">
        <Campo label="Marca *" value={form.marca} onChange={(v) => actualizar("marca", v)} placeholder="Samsung" />
        <Campo
          label="Equipo (modelo exacto) *"
          value={form.equipo}
          onChange={(v) => actualizar("equipo", v)}
          placeholder="A17 5G"
        />
        <Campo
          label="Color"
          value={form.color}
          onChange={(v) => actualizar("color", v)}
          placeholder="Negro"
        />
        <Campo
          label="IMEI 1 * (15 dígitos)"
          value={form.imei1}
          onChange={(v) => actualizar("imei1", v.replace(/\D/g, "").slice(0, 15))}
          type="tel"
          mono
        />
        <Campo
          label="IMEI 2 (opcional, dual SIM)"
          value={form.imei2}
          onChange={(v) => actualizar("imei2", v.replace(/\D/g, "").slice(0, 15))}
          type="tel"
          mono
        />
        <Campo
          label="Precio costo"
          value={form.precioCosto}
          onChange={(v) => actualizar("precioCosto", v.replace(/[^\d]/g, ""))}
          type="tel"
          placeholder="850000"
        />
        <Campo
          label="Proveedor"
          value={form.proveedor}
          onChange={(v) => actualizar("proveedor", v)}
        />
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
            Los campos de IMEI se limpiaron para que sigas agregando el mismo modelo.
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

function Campo({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input
        type={type}
        inputMode={type === "tel" ? "numeric" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 bg-[#0b0d12] border border-[#2a2f3b] rounded-lg text-white placeholder:text-[#5a6170] focus:outline-none focus:border-brand text-sm ${
          mono ? "font-mono" : ""
        }`}
      />
    </div>
  );
}

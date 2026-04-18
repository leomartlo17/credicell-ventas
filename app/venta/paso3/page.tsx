"use client";

export const dynamic = "force-dynamic";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export default function Paso3Wrapper() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-sm">Cargando...</p>
        </main>
      }
    >
      <Paso3Pago />
    </Suspense>
  );
}

function Paso3Pago() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cedula = searchParams.get("cedula") || "";
  const imei = searchParams.get("imei") || "";

  const [producto, setProducto] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!cedula || !imei) {
      setError("Faltan datos del flujo (cédula o IMEI). Vuelve al Paso 1.");
      setCargando(false);
      return;
    }
    fetch(`/api/producto/buscar-imei?imei=${imei}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || "Error al cargar producto");
          return;
        }
        if (!data.encontrado) {
          setError("Producto no encontrado en el inventario");
          return;
        }
        if (data.disponible === false) {
          setError(data.error || "Este equipo ya fue vendido");
          return;
        }
        setProducto(data.producto);
      })
      .catch((e) => setError(e?.message || "Error"))
      .finally(() => setCargando(false));
  }, [status, cedula, imei]);

  if (status === "loading" || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/venta/paso2?cedula=${cedula}`)}
          className="text-muted text-sm hover:text-white"
        >
          ← Paso 2
        </button>
        <div className="text-muted text-xs">CC: {cedula}</div>
      </div>

      <h1 className="text-2xl font-bold mb-1">Paso 3 · Pago</h1>
      <p className="text-muted text-sm mb-6">
        Definir financiera, valor y medios de pago.
      </p>

      {cargando && <p className="text-muted text-sm">Cargando producto...</p>}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {producto && (
        <div className="bg-[#141821] border border-[#2a2f3b] rounded-xl p-4 mb-6">
          <div className="text-xs text-muted mb-1">PRODUCTO SELECCIONADO</div>
          <div className="font-bold text-lg">
            {producto.marca} · {producto.equipo}
          </div>
          <div className="text-sm text-muted mt-1">
            {producto.color && <>Color: {producto.color} · </>}
            IMEI: <span className="font-mono">{producto.imei}</span>
          </div>
        </div>
      )}

      <div className="bg-yellow-950/30 border border-yellow-800 rounded-xl p-4 text-yellow-300 text-sm">
        <strong>En construcción:</strong> Esta es la siguiente fase. Aquí
        vendrá el formulario de financiera (KREDIYA / ADELANTOS / +KUPO /
        BOGOTÁ / ADDI / SU+PAY / RENTING / ALCANOS / Contado), valor total,
        porcentaje de cuota, y desglose de medios de pago. Después de guardar
        este paso escribe en las 4-5 hojas correspondientes y genera la factura.
      </div>
    </main>
  );
}

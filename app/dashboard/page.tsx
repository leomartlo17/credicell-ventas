"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

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

  const sede = (session as any).sede;
  const nombre = session.user?.name?.split(" ")[0] || "Asesor";

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-brand" />
          <span className="font-bold">CREDICELL · Ventas</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-muted text-sm hover:text-white transition-colors"
        >
          Cerrar sesión
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-1">Hola, {nombre}</h1>
      {sede ? (
        <p className="text-muted text-sm mb-8">Tu sede: <span className="text-white font-medium">{sede.nombre}</span></p>
      ) : (
        <p className="text-yellow-400 text-sm mb-8">
          Tu cuenta no está asignada a ninguna sede. Pídele al admin que te agregue.
        </p>
      )}

      <button
        disabled={!sede}
        className="w-full py-4 px-6 bg-brand hover:bg-brand-light disabled:opacity-40 disabled:cursor-not-allowed text-[#0b0d12] font-bold rounded-xl transition-colors text-lg"
      >
        Nueva venta
      </button>
    </main>
  );
}

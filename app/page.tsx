"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center gap-3 mb-6">
          <span className="w-3 h-3 rounded-full bg-brand" />
          <span className="text-xl font-bold">CREDICELL · Ventas</span>
        </div>

        <h1 className="text-3xl font-bold mb-3">Sistema de ventas multi-sede</h1>
        <p className="text-muted text-sm mb-8">
          Inicia sesión con tu cuenta Google CREDICELL.
          <br />
          El sistema detectará tu sede automáticamente.
        </p>

        <button
          className="w-full py-3 px-6 bg-brand hover:bg-brand-light text-[#0b0d12] font-bold rounded-xl transition-colors"
          onClick={() => signIn("google")}
        >
          Iniciar sesión con Google
        </button>
      </div>
    </main>
  );
}

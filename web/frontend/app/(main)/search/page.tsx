"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import SearchClient from "./SearchClient";
import { isTauriRuntime } from "@/lib/desktop/runtime";

function SearchPageContent() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const nextIsDesktop = await isTauriRuntime();
      if (active) {
        setIsDesktop(nextIsDesktop);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (isDesktop === null) {
    return <div className="flex h-screen w-full items-center justify-center text-zinc-500">Comprobando entorno...</div>;
  }

  if (!isDesktop) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center px-6 py-10">
        <section className="max-w-2xl rounded-[32px] border border-white/10 bg-black/40 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-xl md:p-8">
          <div className="rounded-[28px] border border-white/10 bg-[rgba(7,12,24,0.92)] p-6 md:p-8">
            <p className="text-[11px] uppercase tracking-[0.26em] text-cyan-300/80">Busqueda desktop</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">La busqueda solo esta disponible en la app de escritorio</h1>
            <p className="mt-4 text-sm leading-7 text-zinc-400">
              Para que cada usuario use su propio token de Discogs y no comparta limites de peticiones, el Finder web ya no ejecuta busquedas.
            </p>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              Accede desde la app desktop, configura tu token local en perfil y lanza las busquedas desde alli.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/settings"
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Ir a perfil
              </Link>
              <Link
                href="/"
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return <SearchClient />;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center text-zinc-500">Cargando Finder...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}

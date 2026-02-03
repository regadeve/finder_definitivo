"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Page() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();

      // Si NO hay sesión, al login
      if (!data.session) {
        router.replace("/login");
        return;
      }

      // Si SÍ hay sesión, a filtros
      router.replace("/filters");
    })();
  }, [router, supabase]);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <p className="text-zinc-600 dark:text-zinc-400">Cargando…</p>
    </main>
  );
}

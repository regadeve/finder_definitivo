"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Card = {
  title: string;
  artist: string;
  year: number | null;
  have: number | null;
  genres: string[];
  styles: string[];
  num_for_sale: number;
  lowest_price: number | null;
  uri: string;
  thumb: string;
};

export default function SearchClient({
  year_start,
  year_end,
  genre,
  style,
}: {
  year_start: number;
  year_end: number;
  genre: string;
  style: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  const API = useMemo(() => process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000", []);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [items, setItems] = useState<Card[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // 🔐 Protección: si no hay sesión → /login
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setCheckingAuth(false);
    })();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setStatus("Cancelado");
  }

  async function start() {
    setItems([]);
    setRunning(true);
    setStatus("Iniciando…");

    const controller = new AbortController();
    abortRef.current = controller;

    const body = {
      year_start,
      year_end,
      have_limit: 20,
      max_versions: 2,
      country: "",
      format_selected: "Todos",
      type_selected: "Todos",
      genres: genre ? [genre] : [],
      styles: style ? [style] : [],
      strict_genre: false,
      strict_style: false,
      sin_anyo: false,
      solo_en_venta: false,
      precio_minimo: 0,
      max_copias_venta: 0,
      tope_resultados: 0,
      max_pages: 5,
    };

    let res: Response;
    try {
      res = await fetch(`${API}/search/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      setStatus("No puedo conectar con la API (¿está encendida en :8000?)");
      setRunning(false);
      return;
    }

    if (!res.ok || !res.body) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j?.detail ? ` · ${String(j.detail)}` : "";
      } catch {}
      setStatus(`Error API: ${res.status}${detail}`);
      setRunning(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const chunk of parts) {
          const lines = chunk.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));

          const event = eventLine?.replace("event: ", "").trim();
          const dataStr = dataLine?.replace("data: ", "") ?? "{}";
          if (!event) continue;

          let payload: any = {};
          try {
            payload = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (event === "status") {
            setStatus(`Página ${payload.page}/${payload.total_pages} · encontrados ${payload.found}`);
          } else if (event === "item") {
            if (payload?.card) setItems((prev) => [payload.card as Card, ...prev]);
          } else if (event === "done") {
            setStatus(`Finalizado · ${payload.found} resultados`);
            setRunning(false);
            abortRef.current = null;
          }
        }
      }
    } catch {
      setRunning(false);
      abortRef.current = null;
      setStatus("Cancelado");
    }
  }

  if (checkingAuth) return <div className="p-8">Cargando…</div>;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Resultados</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Filtros: {year_start}-{year_end} · {genre || "—"} · {style || "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              API: <span className="font-mono">{API}</span>
            </p>
          </div>

          <a href="/filters" className="text-sm underline text-zinc-700 dark:text-zinc-300">
            Volver a filtros
          </a>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 items-center">
          <button
            onClick={start}
            disabled={running}
            className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60"
          >
            {running ? "Buscando…" : "Buscar"}
          </button>

          <button
            onClick={stop}
            disabled={!running}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 disabled:opacity-60"
          >
            Parar
          </button>

          <div className="text-sm text-zinc-600 dark:text-zinc-400">{status}</div>
        </div>

        <div className="mt-8 space-y-3">
          {items.map((c, i) => (
            <a
              key={`${c.uri}-${i}`}
              href={`https://www.discogs.com${c.uri}`}
              target="_blank"
              rel="noreferrer"
              className="block rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <div className="flex gap-4">
                {c.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumb} alt="" className="w-16 h-16 rounded-lg object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                )}

                <div className="min-w-0">
                  <div className="font-semibold text-black dark:text-zinc-50 truncate">
                    {c.title} <span className="opacity-60">({c.year ?? "—"})</span>
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400 truncate">{c.artist || "—"}</div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    Have: {c.have ?? "—"} · En venta: {c.num_for_sale} · Desde: {c.lowest_price ?? "N/D"}€
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                    {c.styles?.length ? c.styles.join(", ") : "—"}
                  </div>
                </div>
              </div>
            </a>
          ))}

          {!running && items.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Pulsa <b>Buscar</b> para empezar.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

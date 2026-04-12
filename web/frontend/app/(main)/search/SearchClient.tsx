"use client";

import { Suspense, useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { STYLES } from "@/lib/supabase/discogs/styles";
import { createClient } from "@/lib/supabase/client";
import {
  getSearchRuntimeLabel,
  startSearchStream,
  type SearchFiltersPayload,
  type SearchCard,
} from "@/lib/discogs/search-stream";
import { openDiscogsRelease, openGoogleSearch } from "@/lib/discogs/url";
import {
  fetchUserReleaseStates,
  upsertUserReleaseState,
  type ReleaseCardPayload,
  type UserReleaseState,
} from "@/lib/supabase/user-releases";
import { insertUserSearch, updateUserSearch } from "@/lib/supabase/user-searches";

const GENRES = ["Electronic", "Rock", "Jazz", "Funk / Soul", "Hip Hop", "Pop", "Classical", "Reggae", "Blues", "Latin"];
const FORMATS = ["Vinyl", "CD", "Cassette", "File", "CDr", "DVD", "Box Set", "All Media", "LP", '7"', '12"', '10"', "Album", "Single", "EP", "Compilation", "Promo", "Limited Edition", "Reissue", "Remastered", "Mono", "Stereo", "White Label", "Test Pressing", "Mini-Album", "Maxi-Single", "Picture Disc", "Flexi-disc", "Shellac", "Blu-ray", "SACD", "VHS", "DVD-Video"];
const COUNTRIES = ["US", "UK", "Germany", "France", "Japan", "Italy", "Spain", "Netherlands", "Canada", "Australia", "Sweden", "Belgium", "Brazil", "Russia", "Switzerland", "Poland", "Finland", "Austria", "Greece", "Denmark", "Norway", "Argentina", "Portugal", "Mexico", "South Africa", "Europe", "Scandinavia", "UK & Europe", "UK & US", "Worldwide", "New Zealand", "Colombia", "Chile", "Peru", "Venezuela", "Yugoslavia", "Czechoslovakia", "USSR", "Ireland", "Ukraine", "Romania", "Hungary", "Croatia", "Serbia", "Turkey", "Israel", "India", "Indonesia", "Philippines", "Taiwan", "South Korea", "Hong Kong", "China", "Singapore", "Malaysia"].sort();

// Pequeños componentes UI reutilizados
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-zinc-400">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-xs text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/10 ${props.className ?? ""}`} />;
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-xs text-white outline-none transition focus:border-cyan-400/50 focus:bg-[#101828] ${props.className ?? ""}`} />;
}

function ToggleRow({ checked, onChange, title }: { checked: boolean; onChange: (value: boolean) => void; title: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 hover:bg-white/10 transition">
      <span className="text-xs font-medium text-zinc-300">{title}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 rounded border-white/20 bg-transparent text-cyan-400" />
    </label>
  );
}

function MultiSelectMini({ label, options, values, onChange }: { label: string; options: string[]; values: string[]; onChange: (next: string[]) => void; }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options.slice(0, 100);
    return options.filter((o) => o.toLowerCase().includes(qq)).slice(0, 100);
  }, [options, q]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-[10px] text-zinc-500">{values.length} sel</span>
      </div>
      <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${label.toLowerCase()}...`} />
      <div className="filters-scrollbar max-h-32 space-y-1 overflow-auto rounded-xl border border-white/5 bg-black/40 p-1">
        {filtered.map(opt => {
          const active = values.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => active ? onChange(values.filter(v => v !== opt)) : onChange([...values, opt])} className={`w-full text-left px-2 py-1.5 text-xs rounded-lg transition ${active ? "bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/40" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}>
              {opt}
            </button>
          );
        })}
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map(v => (
             <button key={v} type="button" onClick={() => onChange(values.filter(item => item !== v))} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-rose-500/20 hover:text-rose-300 transition">{v} ×</button>
          ))}
        </div>
      )}
    </div>
  );
}

function metricBadge(label: string, value: string) {
  return (
    <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 backdrop-blur">
      {label} {value}
    </span>
  );
}

function normalizeFilters(input: Partial<SearchFiltersPayload>): SearchFiltersPayload {
  return {
    year_start: input.year_start ?? 1995,
    year_end: input.year_end ?? 1995,
    have_min: input.have_min ?? 0,
    have_max: input.have_max ?? 80,
    want_min: input.want_min ?? 0,
    want_max: input.want_max ?? 0,
    max_versions: input.max_versions ?? 2,
    countries_selected: input.countries_selected ?? [],
    formats_selected: input.formats_selected ?? [],
    type_selected: input.type_selected ?? "Todos",
    genres: input.genres ?? ["Electronic"],
    styles: input.styles ?? ["EBM"],
    strict_genre: input.strict_genre ?? false,
    strict_style: input.strict_style ?? false,
    sin_anyo: input.sin_anyo ?? false,
    solo_en_venta: input.solo_en_venta ?? false,
    precio_minimo: input.precio_minimo ?? 0,
    precio_maximo: input.precio_maximo ?? 0,
    max_copias_venta: input.max_copias_venta ?? 0,
    tope_resultados: input.tope_resultados ?? 0,
    youtube_status: input.youtube_status ?? "Todos",
  };
}

export default function FinderClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState<string | null>(null);
  
  // Filtros
  const [yearStart, setYearStart] = useState(1995);
  const [yearEnd, setYearEnd] = useState(1995);
  const [haveMin, setHaveMin] = useState(0);
  const [haveMax, setHaveMax] = useState(80);
  const [wantMin, setWantMin] = useState(0);
  const [wantMax, setWantMax] = useState(0);
  const [maxVersions, setMaxVersions] = useState(2);
  const [countriesSelected, setCountriesSelected] = useState<string[]>([]);
  const [formatsSelected, setFormatsSelected] = useState<string[]>([]);
  const [typeSelected, setTypeSelected] = useState("Todos");
  const [youtubeStatus, setYoutubeStatus] = useState("Todos");
  const [genres, setGenres] = useState<string[]>(["Electronic"]);
  const [styles, setStyles] = useState<string[]>(["EBM"]);
  const [strictGenre, setStrictGenre] = useState(false);
  const [strictStyle, setStrictStyle] = useState(false);
  const [sinAnyo, setSinAnyo] = useState(false);
  const [soloEnVenta, setSoloEnVenta] = useState(false);
  const [precioMinimo, setPrecioMinimo] = useState(0);
  const [precioMaximo, setPrecioMaximo] = useState(0);
  const [maxCopiasVenta, setMaxCopiasVenta] = useState(0);
  const [topeResultados, setTopeResultados] = useState(0);

  // Search State
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Ajusta los filtros arriba y busca.");
  const [processedCount, setProcessedCount] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [pageInfo, setPageInfo] = useState({ page: 0, total: 0 });
  const [items, setItems] = useState<SearchCard[]>([]);
  const [releaseStates, setReleaseStates] = useState<Record<string, UserReleaseState>>({});
  
  const abortRef = useRef<AbortController | null>(null);
  const searchHistoryIdRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) { router.replace("/"); return; }
      setUserId(data.session.user.id);
    })();
    return () => { active = false; };
  }, [supabase, router]);
  
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const uniqueUris = Array.from(new Set(items.map((item) => item.uri).filter(Boolean)));
    const missingUris = uniqueUris.filter((uri) => !(uri in releaseStates));
    if (!userId || missingUris.length === 0) return;

    let active = true;
    void (async () => {
      try {
        const fetched = await fetchUserReleaseStates(supabase, userId, missingUris);
        if (active) setReleaseStates(prev => ({ ...prev, ...fetched }));
      } catch (e) {
        // quiet fail cache
      }
    })();
    return () => { active = false; };
  }, [items, releaseStates, supabase, userId]);
  
  async function toggleState(card: SearchCard, field: "listened" | "is_favorite") {
    if (!userId || !card.uri) return;
    const current = releaseStates[card.uri] ?? { is_favorite: false, listened: false };
    const next = { ...current, [field]: !current[field] };
    setReleaseStates(prev => ({ ...prev, [card.uri]: next }));
    
    try {
      await upsertUserReleaseState(supabase, userId, {
        uri: card.uri, title: card.title, artist: card.artist, year: card.year, thumb: card.thumb, country: card.country, genres: card.genres, styles: card.styles, formats: card.formats
      }, next);
    } catch (e) {
      setReleaseStates(prev => ({ ...prev, [card.uri]: current }));
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setStatus("Búsqueda detenida.");
    if (searchHistoryIdRef.current) {
      void updateUserSearch(supabase, searchHistoryIdRef.current, { status: "aborted", result_count: foundCount });
      searchHistoryIdRef.current = null;
    }
  }

  const start = useCallback(async (overrideFilters?: SearchFiltersPayload) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setItems([]); setReleaseStates({});
    setRunning(true); setProcessedCount(0); setFoundCount(0); setPageInfo({ page: 0, total: 0 });
    setStatus("Conectando con Discogs...");

    const filters = overrideFilters ?? normalizeFilters({ year_start: yearStart, year_end: yearEnd, have_min: haveMin, have_max: haveMax, want_min: wantMin, want_max: wantMax, max_versions: maxVersions, countries_selected: countriesSelected, formats_selected: formatsSelected, type_selected: typeSelected, genres, styles, strict_genre: strictGenre, strict_style: strictStyle, sin_anyo: sinAnyo, solo_en_venta: soloEnVenta, precio_minimo: precioMinimo, precio_maximo: precioMaximo, max_copias_venta: maxCopiasVenta, tope_resultados: topeResultados, youtube_status: youtubeStatus });

    searchHistoryIdRef.current = null;
    if (userId) {
      try {
        searchHistoryIdRef.current = await insertUserSearch(supabase, userId, filters);
      } catch {
        // keep search running even if history table is missing
      }
    }

    try {
      await startSearchStream({
        filters,
        signal: controller.signal,
        onStatus: (p) => {
          setPageInfo({ page: p.page ?? 0, total: p.total_pages ?? 0 });
          setFoundCount(p.found ?? 0); setProcessedCount(p.processed ?? 0);
          setStatus(`Página ${p.page}/${p.total_pages} · procesados ${p.processed} · encontrados ${p.found}`);
        },
        onItem: (p) => { if (p.card) setItems(prev => [...prev, p.card as SearchCard]); },
        onDone: (p) => {
          setFoundCount(p.found ?? 0);
          setStatus(`Terminado · ${p.found} resultados.`);
          setRunning(false);
          abortRef.current = null;
          if (searchHistoryIdRef.current) {
            void updateUserSearch(supabase, searchHistoryIdRef.current, { status: "completed", result_count: p.found ?? 0 });
            searchHistoryIdRef.current = null;
          }
        },
      });
    } catch (e) {
      if (!controller.signal.aborted) {
        setStatus("Error de conexión con Discogs.");
        if (searchHistoryIdRef.current) {
          void updateUserSearch(supabase, searchHistoryIdRef.current, { status: "failed", result_count: foundCount });
          searchHistoryIdRef.current = null;
        }
      }
      setRunning(false); abortRef.current = null;
    }
  }, [yearStart, yearEnd, haveMin, haveMax, wantMin, wantMax, maxVersions, countriesSelected, formatsSelected, typeSelected, genres, styles, strictGenre, strictStyle, sinAnyo, soloEnVenta, precioMinimo, precioMaximo, maxCopiasVenta, topeResultados, youtubeStatus, userId, supabase, foundCount]);

  useEffect(() => {
    const rawFilters = searchParams.get("savedFilters");
    if (!rawFilters) return;

    try {
      const parsed = normalizeFilters(JSON.parse(rawFilters) as Partial<SearchFiltersPayload>);

      setYearStart(parsed.year_start);
      setYearEnd(parsed.year_end);
      setHaveMin(parsed.have_min);
      setHaveMax(parsed.have_max);
      setWantMin(parsed.want_min);
      setWantMax(parsed.want_max);
      setMaxVersions(parsed.max_versions);
      setCountriesSelected(parsed.countries_selected);
      setFormatsSelected(parsed.formats_selected);
      setTypeSelected(parsed.type_selected);
      setYoutubeStatus(parsed.youtube_status);
      setGenres(parsed.genres);
      setStyles(parsed.styles);
      setStrictGenre(parsed.strict_genre);
      setStrictStyle(parsed.strict_style);
      setSinAnyo(parsed.sin_anyo);
      setSoloEnVenta(parsed.solo_en_venta);
      setPrecioMinimo(parsed.precio_minimo);
      setPrecioMaximo(parsed.precio_maximo);
      setMaxCopiasVenta(parsed.max_copias_venta);
      setTopeResultados(parsed.tope_resultados);
      router.replace("/search");
      void start(parsed);
    } catch {
      setStatus("No se pudieron cargar los filtros guardados.");
    }
  }, [router, searchParams, start]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0">
      
      {/* Filters Sidebar */}
      <aside className="filters-scrollbar flex h-full w-[340px] shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-black/60 p-5 backdrop-blur-xl space-y-8">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Criterios de Búsqueda</h2>
          <p className="text-xs text-zinc-500">Filtrado en el dispositivo del usuario</p>
        </div>

        <section className="space-y-4">
           <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Año inicio</FieldLabel><TextInput type="number" value={yearStart} onChange={e => setYearStart(Number(e.target.value))} disabled={sinAnyo}/></div>
            <div><FieldLabel>Año fin</FieldLabel><TextInput type="number" value={yearEnd} onChange={e => setYearEnd(Number(e.target.value))} disabled={sinAnyo}/></div>
            <div><FieldLabel>Have min</FieldLabel><TextInput type="number" value={haveMin} onChange={e => setHaveMin(Number(e.target.value))} /></div>
            <div><FieldLabel>Have max</FieldLabel><TextInput type="number" value={haveMax} onChange={e => setHaveMax(Number(e.target.value))} /></div>
             <div><FieldLabel>Max versiones</FieldLabel><TextInput type="number" value={maxVersions} onChange={e => setMaxVersions(Number(e.target.value))} /></div>
              <div>
                <FieldLabel>Tipo</FieldLabel>
                <SelectInput value={typeSelected} onChange={e => setTypeSelected(e.target.value)}>
                  <option>Todos</option><option>release</option><option>master</option>
                </SelectInput>
              </div>
             <div><FieldLabel>Precio min</FieldLabel><TextInput type="number" min="0" step="0.01" value={precioMinimo} onChange={e => setPrecioMinimo(Number(e.target.value))} /></div>
             <div><FieldLabel>Precio max</FieldLabel><TextInput type="number" min="0" step="0.01" value={precioMaximo} onChange={e => setPrecioMaximo(Number(e.target.value))} /></div>
             <div className="col-span-2">
               <FieldLabel>YouTube</FieldLabel>
               <SelectInput value={youtubeStatus} onChange={e => setYoutubeStatus(e.target.value)}>
                 <option>Todos</option>
                 <option>Si</option>
                 <option>No</option>
               </SelectInput>
             </div>
           </div>
          
          <div className="space-y-2">
            <ToggleRow checked={sinAnyo} onChange={setSinAnyo} title="Solo Discos Sin Año" />
            <ToggleRow checked={soloEnVenta} onChange={setSoloEnVenta} title="Solo Copias en Venta" />
          </div>
        </section>

        <section className="space-y-4">
          <MultiSelectMini label="Géneros" options={GENRES} values={genres} onChange={setGenres} />
          <MultiSelectMini label="Estilos" options={STYLES} values={styles} onChange={setStyles} />
          
          <div className="space-y-2 pt-2">
            <ToggleRow checked={strictGenre} onChange={setStrictGenre} title="Género Exacto" />
            <ToggleRow checked={strictStyle} onChange={setStrictStyle} title="Estilo Exacto" />
          </div>
        </section>

        <section className="space-y-4 pb-12">
           <MultiSelectMini label="Formatos" options={FORMATS} values={formatsSelected} onChange={setFormatsSelected} />
           <MultiSelectMini label="Países" options={COUNTRIES} values={countriesSelected} onChange={setCountriesSelected} />
        </section>
      </aside>

      {/* Main Results Container */}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.1),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(217,70,239,0.05),_transparent_40%)]">
        
        {/* Header Action Bar */}
        <header className="flex shrink-0 items-center justify-between border-b border-white/5 bg-black/40 px-8 py-5 backdrop-blur-md">
          <div className="flex gap-4">
             <button disabled={running} onClick={() => void start()} className={`rounded-full px-8 py-3 text-sm font-bold tracking-wide text-[black] bg-[var(--neon-cyan)] shadow-[0_0_25px_rgba(6,182,212,0.6)] transition-all hover:brightness-110 active:scale-95 flex items-center gap-2 ${running ? 'opacity-50 blur-[1px]' : ''}`}>
               {running ? "Buscando..." : "DIGGING ⟿"}
             </button>
             <button disabled={!running} onClick={stop} className="rounded-full px-6 py-3 text-sm font-bold tracking-wide text-rose-300 border border-rose-500/50 bg-rose-500/10 transition-all hover:bg-rose-500/20 active:scale-95 disabled:opacity-20 disabled:scale-100">
               PARAR ⨯
             </button>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-400">Stream Status</p>
              <p className="text-sm font-medium text-white">{status}</p>
            </div>
          </div>
        </header>

        {/* Results Stream Area */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10 lg:px-14">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-20">
            {items.map((card, index) => {
              const state = releaseStates[card.uri] ?? { is_favorite: false, listened: false };
              const glassCard = "relative overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-xl backdrop-blur-md transition-all hover:-translate-y-1 hover:border-cyan-400/30 hover:shadow-[0_20px_40px_rgba(6,182,212,0.1)]";

              return (
                <article key={`${card.uri}-${index}`} className={`${glassCard} animate-fade-up-soft`} style={{ animationDelay: `${Math.min(index * 30, 240)}ms` }}>
                  {state.listened && <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(251,113,133,0.2),rgba(127,29,29,0.42))] pointer-events-none" />}
                  
                  <div className="flex gap-5">
                    {/* Vinyl Cover Simulation */}
                    <div className="group relative h-[100px] w-[100px] shrink-0">
                       <div className="absolute -inset-1 rounded-full bg-black scale-[0.85] translate-x-4 transition-transform group-hover:translate-x-8 group-hover:rotate-180 duration-1000 ease-out" style={{ backgroundImage: "repeating-radial-gradient(#111 0px, #111 2px, #222 3px, #111 4px)" }}>
                         <div className="absolute inset-[35%] rounded-full bg-cyan-500/30" />
                       </div>
                       <Image src={card.thumb || "/favicon.ico"} alt={card.title || "Portada"} width={100} height={100} unoptimized className="relative z-10 h-full w-full rounded-lg object-cover shadow-[0_10px_20px_rgba(0,0,0,0.6)] border border-white/10 group-hover:scale-[1.02] transition-transform" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 uppercase text-[9px] tracking-[0.25em] text-cyan-400/80">{card.genres?.[0] || 'Unknown'} — {card.year ?? "?"}</div>
                      <h3 className="truncate font-serif text-lg font-bold leading-tight text-white mb-1" title={card.title}>{card.title}</h3>
                      <p className="truncate text-sm text-zinc-400 font-medium" title={card.artist}>{card.artist}</p>
                      
                       <div className="mt-3 flex flex-wrap gap-1.5 opacity-80">
                         {metricBadge("Have", String(card.have ?? "-"))}
                         {metricBadge("Venta", String(card.num_for_sale ?? 0))}
                         {metricBadge("De", `${card.lowest_price ?? "N/D"}€`)}
                         {metricBadge("YouTube", card.has_youtube ? "Si" : "No")}
                       </div>

                       <div className="mt-5 flex flex-wrap gap-2">
                         <button onClick={() => toggleState(card, "is_favorite")} title="Favorito" className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${state.is_favorite ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40" : "bg-white/5 text-zinc-400 hover:bg-white/15"}`}>⭐</button>
                         <button onClick={() => toggleState(card, "listened")} title="Escuchado" className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${state.listened ? "bg-rose-500/35 text-rose-100 ring-1 ring-rose-300/70 shadow-[0_0_20px_rgba(244,63,94,0.28)]" : "bg-white/5 text-zinc-400 hover:bg-white/15"}`}>🎧</button>
                         <button onClick={() => { if (!state.listened) { void toggleState(card, "listened"); } void openDiscogsRelease(card.uri); }} className="px-4 py-1.5 h-8 text-[11px] font-bold uppercase tracking-wider bg-white/5 text-white rounded-full hover:bg-cyan-500 hover:text-black transition">
                           Discogs ↗
                         </button>
                         <button onClick={() => { void openGoogleSearch(card.artist, card.title); }} className="px-4 py-1.5 h-8 text-[11px] font-bold uppercase tracking-wider rounded-full border border-emerald-300/30 bg-emerald-300/15 text-emerald-100 transition hover:bg-emerald-300/30">
                           Google ↗
                         </button>
                       </div>
                    </div>
                  </div>
                </article>
              );
            })}
            
            {!running && items.length === 0 && (
              <div className="col-span-full flex flex-col justify-center items-center py-32 opacity-40">
                <div className="text-6xl mb-4 grayscale">💿</div>
                <h2 className="text-xl font-serif text-zinc-300">Ready to Dig</h2>
                <p className="text-sm text-zinc-500 mt-2">Usa el panel lateral izquierdo para preparar tu set.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Puedes meter aquí tus listas completas si quieres (GENRES ya la tienes corta).
const GENRES = [
  "Electronic",
  "Rock",
  "Jazz",
  "Funk / Soul",
  "Hip Hop",
  "Pop",
  "Classical",
  "Reggae",
  "Blues",
  "Latin",
];

// Para que se parezca a tu original: multiselect con buscador.
// Si quieres, en el siguiente paso te conecto tu lista enorme de STYLES importándola desde un archivo.
const STYLES_SAMPLE = [
  "EBM",
  "Synth-pop",
  "Techno",
  "Electro",
  "Industrial",
  "New Wave",
  "Darkwave",
  "Italo-Disco",
  "Minimal",
  "Trance",
];

function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = "Buscar…",
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options.slice(0, 120);
    return options.filter((o) => o.toLowerCase().includes(qq)).slice(0, 200);
  }, [options, q]);

  function toggle(v: string) {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {label}
      </label>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm"
      />

      <div className="max-h-52 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-2">
        {filtered.map((opt) => {
          const active = values.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                active ? "bg-zinc-100 dark:bg-zinc-900 font-medium" : ""
              }`}
            >
              {active ? "✅ " : "⬜ "} {opt}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-zinc-500">Sin resultados</div>
        )}
      </div>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded-full border border-zinc-200 dark:border-zinc-800 px-3 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
              title="Quitar"
            >
              {v} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FiltersPage() {
  const router = useRouter();

  // --- Estado (igual que tu Streamlit) ---
  const [yearStart, setYearStart] = useState(1995);
  const [yearEnd, setYearEnd] = useState(1995);
  const [haveLimit, setHaveLimit] = useState(20);
  const [maxVersions, setMaxVersions] = useState(2);
  const [country, setCountry] = useState("");

  const [formatSelected, setFormatSelected] = useState("Todos");
  const [typeSelected, setTypeSelected] = useState("Todos");

  const [genres, setGenres] = useState<string[]>(["Electronic"]);
  const [styles, setStyles] = useState<string[]>(["EBM"]);

  const [strictGenre, setStrictGenre] = useState(false);
  const [strictStyle, setStrictStyle] = useState(false);
  const [sinAnyo, setSinAnyo] = useState(false);

  const [soloEnVenta, setSoloEnVenta] = useState(false);
  const [precioMinimo, setPrecioMinimo] = useState(0);
  const [maxCopiasVenta, setMaxCopiasVenta] = useState(0);

  const [topeResultados, setTopeResultados] = useState(0);
  const [maxPages, setMaxPages] = useState(5);

  const canSubmit = useMemo(() => {
    if (sinAnyo) return true;
    return Number.isFinite(yearStart) && Number.isFinite(yearEnd) && yearStart <= yearEnd;
  }, [sinAnyo, yearStart, yearEnd]);

  function submit() {
    if (!canSubmit) return;

    const params = new URLSearchParams();

    params.set("year_start", String(yearStart));
    params.set("year_end", String(yearEnd));
    params.set("have_limit", String(haveLimit));
    params.set("max_versions", String(maxVersions));
    params.set("country", country);
    params.set("format_selected", formatSelected);
    params.set("type_selected", typeSelected);

    params.set("strict_genre", String(strictGenre));
    params.set("strict_style", String(strictStyle));
    params.set("sin_anyo", String(sinAnyo));

    params.set("solo_en_venta", String(soloEnVenta));
    params.set("precio_minimo", String(precioMinimo));
    params.set("max_copias_venta", String(maxCopiasVenta));

    params.set("tope_resultados", String(topeResultados));
    params.set("max_pages", String(maxPages));

    genres.forEach((g) => params.append("genre", g));
    styles.forEach((s) => params.append("style", s));

    router.push(`/search?${params.toString()}`);
  }

  function resetUI() {
    // Esto solo resetea la UI; el “borrar resultados” real lo hará /search en memoria.
    setGenres([]);
    setStyles([]);
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-6xl p-8">
        {/* Header como tu Streamlit */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
            Discogs Finder
          </h1>
          <h2 className="mt-2 text-lg font-semibold" style={{ color: "#1DB954" }}>
            ⚙️ Filtros de búsqueda
          </h2>
        </div>

        {/* Dos columnas como tu Streamlit */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Columna izquierda */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Año de inicio</label>
                  <input
                    type="number"
                    value={yearStart}
                    onChange={(e) => setYearStart(Number(e.target.value))}
                    disabled={sinAnyo}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Año de fin (opcional)</label>
                  <input
                    type="number"
                    value={yearEnd}
                    onChange={(e) => setYearEnd(Number(e.target.value))}
                    disabled={sinAnyo}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Máximo Have</label>
                  <input
                    type="number"
                    value={haveLimit}
                    onChange={(e) => setHaveLimit(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Máximo versiones</label>
                  <input
                    type="number"
                    value={maxVersions}
                    onChange={(e) => setMaxVersions(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">País (ISO)</label>
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="ES, US, DE…"
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Formato</label>
                  <select
                    value={formatSelected}
                    onChange={(e) => setFormatSelected(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                  >
                    <option>Todos</option>
                    <option>CD</option>
                    <option>Vinyl</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Tipo de búsqueda</label>
                  <select
                    value={typeSelected}
                    onChange={(e) => setTypeSelected(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                  >
                    <option>Todos</option>
                    <option>release</option>
                    <option>master</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sinAnyo}
                    onChange={(e) => setSinAnyo(e.target.checked)}
                  />
                  📅 Solo mostrar discos sin año
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={strictGenre}
                    onChange={(e) => setStrictGenre(e.target.checked)}
                  />
                  🎯 Solo géneros exclusivamente seleccionados
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={strictStyle}
                    onChange={(e) => setStrictStyle(e.target.checked)}
                  />
                  🎯 Solo estilos exclusivamente seleccionados
                </label>
              </div>
            </div>

            {/* Venta / precio */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6">
              <h3 className="font-semibold text-black dark:text-zinc-50">🛒 Venta / Precio</h3>

              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={soloEnVenta}
                    onChange={(e) => setSoloEnVenta(e.target.checked)}
                  />
                  🛒 Solo si hay copias en venta
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">💰 Precio mínimo (€)</label>
                    <input
                      type="number"
                      value={precioMinimo}
                      onChange={(e) => setPrecioMinimo(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">📦 Máximo copias en venta (0=sin límite)</label>
                    <input
                      type="number"
                      value={maxCopiasVenta}
                      onChange={(e) => setMaxCopiasVenta(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Control */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6">
              <h3 className="font-semibold text-black dark:text-zinc-50">⛔ Control</h3>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">⛔ Tope resultados (0=sin tope)</label>
                  <input
                    type="number"
                    value={topeResultados}
                    onChange={(e) => setTopeResultados(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Máximo páginas</label>
                  <input
                    type="number"
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Columna derecha */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6">
              <MultiSelect label="Géneros" options={GENRES} values={genres} onChange={setGenres} />
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6">
              <MultiSelect
                label="Estilos (AND)"
                options={STYLES_SAMPLE}
                values={styles}
                onChange={setStyles}
                placeholder="Busca y añade estilos…"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Ahora está con una lista pequeña de ejemplo. Si quieres, te conecto tu lista completa de estilos.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetUI}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                🗑 Borrar selección
              </button>

              <button
                type="button"
                disabled={!canSubmit}
                onClick={submit}
                className="flex-1 rounded-xl bg-black text-white py-3 text-sm font-semibold disabled:opacity-60"
              >
                🔍 Buscar en Discogs
              </button>
            </div>

            {!canSubmit && (
              <p className="text-sm text-red-600">
                Revisa los años: el inicio no puede ser mayor que el fin.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

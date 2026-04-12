"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDiscogsHref, openDiscogsRelease, openGoogleSearch } from "@/lib/discogs/url";
import { upsertUserReleaseState, type ReleaseCardPayload } from "@/lib/supabase/user-releases";
import { navigateWithTransition } from "@/lib/view-transition";

type FavoriteRow = {
  release_uri: string;
  title: string | null;
  artist: string | null;
  year: number | null;
  thumb: string | null;
  country: string | null;
  styles: string[] | null;
  listened_at: string | null;
  listened: boolean;
  is_favorite: boolean;
  updated_at: string;
};

function panel(extra = "") {
  return `rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl ${extra}`;
}

function metricBadge(label: string, value: string) {
  return (
    <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
      {label} {value}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("es-ES");
}

export default function FavoritesPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [dbError, setDbError] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        navigateWithTransition(router, "/", "replace");
        return;
      }

      const nextUserId = data.session.user.id;
      setUserId(nextUserId);

      const { data: rows, error } = await supabase
        .from("user_releases")
        .select("release_uri, title, artist, year, thumb, country, styles, listened, listened_at, is_favorite, updated_at")
        .eq("user_id", nextUserId)
        .eq("is_favorite", true)
        .order("updated_at", { ascending: false });

      if (!active) return;
      if (error) {
        setDbError(`${error.message} · aplica la migracion de user_releases en Supabase.`);
      }
      setItems((rows ?? []) as FavoriteRow[]);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function logout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    navigateWithTransition(router, "/", "replace");
    setLoggingOut(false);
  }

  async function updateRow(row: FavoriteRow, next: { listened: boolean; is_favorite: boolean }) {
    if (!userId) return;

    const payload: ReleaseCardPayload = {
      uri: row.release_uri,
      title: row.title ?? "",
      artist: row.artist ?? "",
      year: row.year,
      thumb: row.thumb ?? "",
      country: row.country ?? "",
      styles: row.styles ?? [],
    };

    try {
      await upsertUserReleaseState(supabase, userId, payload, next);
      setDbError("");
    } catch (error) {
      setDbError(
        error instanceof Error
          ? `${error.message} · aplica la migracion supabase/migrations/20260313_create_user_releases.sql.`
          : "No se pudo guardar el estado del favorito en Supabase."
      );
      return;
    }

    if (!next.is_favorite) {
      setItems((prev) => prev.filter((item) => item.release_uri !== row.release_uri));
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.release_uri === row.release_uri
          ? { ...item, listened: next.listened, is_favorite: next.is_favorite }
          : item
      )
    );
  }

  if (loading) {
    return <main className="min-h-screen bg-[#050816] p-8 text-zinc-200">Cargando favoritos...</main>;
  }

  return (
    <main className="min-h-screen bg-[#050816] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-0 top-0 h-[420px] w-[420px] rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute right-0 top-24 h-[360px] w-[360px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 py-8 md:px-8 lg:px-10 lg:py-10">
        <section className="animate-fade-up-soft mb-8 overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,15,28,0.92),rgba(8,12,23,0.76))] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.45)] md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-300/80">Favorite Crate</p>
              <h1 className="mt-4 max-w-3xl font-[var(--font-display-serif)] text-5xl leading-none text-white md:text-7xl">
                Tus favoritos y lo que ya has escuchado.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 md:text-base">
                Cada usuario tiene su propia coleccion guardada. Los releases escuchados aparecen en rojo para distinguirlos al instante.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Favoritos</p>
                <p className="mt-3 text-3xl font-semibold text-white">{items.length}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Escuchados</p>
                <p className="mt-3 text-3xl font-semibold text-white">{items.filter((item) => item.listened).length}</p>
              </div>
            </div>
          </div>
        </section>

        <section className={`${panel("animate-fade-up-soft p-5 md:p-6")} [animation-delay:120ms]`}>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigateWithTransition(router, "/search")}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
            >
              Volver a filtros
            </button>
            <button
              type="button"
              onClick={() => navigateWithTransition(router, "/listened")}
              className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-100 transition hover:bg-rose-400/20"
            >
              Ver escuchados
            </button>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-50"
            >
              {loggingOut ? "Cerrando..." : "Cerrar sesion"}
            </button>
          </div>

          {dbError && (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {dbError}
            </div>
          )}
        </section>

        <section className="mt-8 space-y-4">
          {items.map((row, index) => (
            <a
              key={row.release_uri}
              href={getDiscogsHref(row.release_uri)}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                if (!row.listened) {
                  void updateRow(row, { listened: true, is_favorite: true });
                }
              }}
              className={`animate-fade-up-soft block rounded-[28px] border p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:border-cyan-400/30 md:p-5 ${
                row.listened
                  ? "border-rose-300/55 bg-[linear-gradient(135deg,rgba(225,29,72,0.34),rgba(127,29,29,0.7))] shadow-[0_0_0_1px_rgba(253,164,175,0.12),0_24px_60px_rgba(136,19,55,0.34)] hover:bg-[linear-gradient(135deg,rgba(244,63,94,0.42),rgba(136,19,55,0.78))]"
                  : "border-white/10 bg-white/[0.04] hover:bg-white/[0.06]"
              }`}
              style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
            >
              <div className="flex gap-4">
                {row.thumb ? (
                  <Image
                    src={row.thumb}
                    alt={row.title || "Portada del release"}
                    width={88}
                    height={88}
                    unoptimized
                    className="h-[88px] w-[88px] rounded-2xl object-cover ring-1 ring-white/10"
                  />
                ) : (
                  <div className="h-[88px] w-[88px] rounded-2xl bg-[#101828] ring-1 ring-white/10" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold text-white">
                        {row.title || "Sin titulo"} <span className="text-zinc-500">({row.year ?? "-"})</span>
                      </div>
                      <div className="mt-1 truncate text-sm text-zinc-400">{row.artist || "-"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.listened ? metricBadge("Escuchado", "Si") : null}
                      {metricBadge("Favorito", "Si")}
                      {metricBadge("Pais", row.country || "Unknown")}
                      {row.listened ? metricBadge("Fecha", formatDate(row.listened_at)) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!row.listened) {
                          void updateRow(row, { listened: true, is_favorite: true });
                        }
                        openDiscogsRelease(row.release_uri);
                      }}
                      className="rounded-2xl border border-cyan-300/30 bg-cyan-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/30"
                    >
                      Abrir en Discogs
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void openGoogleSearch(row.artist ?? "", row.title ?? "");
                      }}
                      className="rounded-2xl border border-emerald-300/30 bg-emerald-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-300/30"
                    >
                      Buscar en Google
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void updateRow(row, { listened: !row.listened, is_favorite: true });
                      }}
                      className={`rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                        row.listened
                          ? "border border-rose-200/40 bg-rose-400/30 text-rose-50 shadow-[0_0_18px_rgba(244,63,94,0.18)]"
                          : "border border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                       }`}
                    >
                      {row.listened ? "Quitar escuchado" : "Marcar escuchado"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void updateRow(row, { listened: row.listened, is_favorite: false });
                      }}
                      className="rounded-2xl border border-amber-300/30 bg-amber-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-300/30"
                    >
                      Quitar favorito
                    </button>
                  </div>

                  {row.styles?.length ? (
                    <div className="mt-3 text-xs leading-6 text-zinc-400">Estilos: {row.styles.join(", ")}</div>
                  ) : null}
                </div>
              </div>
            </a>
          ))}

          {items.length === 0 && (
            <div className={`${panel("animate-fade-up-soft p-8 text-center")} [animation-delay:180ms]`}>
              <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">No favorites yet</p>
              <p className="mt-3 text-lg font-semibold text-white">Todavia no has guardado favoritos.</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                En la pantalla de resultados puedes marcar cualquier release como favorito y quedara guardado solo para tu usuario.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

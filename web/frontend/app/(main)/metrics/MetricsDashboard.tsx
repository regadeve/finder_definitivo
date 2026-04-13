"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Image from "next/image";
import type { YearlessReleaseHit } from "@/lib/supabase/yearless-releases";

type ProfileMetricRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_seen_at: string | null;
  is_admin: boolean;
  bypass_subscription: boolean;
};

type SubscriptionMetricRow = {
  user_id: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

type SearchMetricRow = {
  id: number;
  user_id: string;
  status: "running" | "completed" | "aborted" | "failed";
  result_count: number;
  created_at: string;
  filters: {
    genres?: string[];
    styles?: string[];
    countries_selected?: string[];
    formats_selected?: string[];
    sin_anyo?: boolean;
    solo_en_venta?: boolean;
    not_on_label_only?: boolean;
    exclude_various?: boolean;
  };
};

type ReleaseMetricRow = {
  user_id: string;
  release_uri: string;
  title: string | null;
  artist: string | null;
  is_favorite: boolean;
  listened: boolean;
  listened_at: string | null;
  genres: string[];
  styles: string[];
  formats: string[];
  updated_at: string;
};

function panel(extra = "") {
  return `rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl ${extra}`;
}

function collapseTitle(kicker: string, title: string, hint: string, value?: string) {
  return (
    <div className="flex min-w-0 flex-1 items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">{kicker}</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{hint}</p>
      </div>
      {value ? <p className="shrink-0 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">{value}</p> : null}
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{hint}</p>
    </article>
  );
}

function Fold({ kicker, title, hint, value, defaultOpen = false, children }: { kicker: string; title: string; hint: string; value?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className={panel("group p-0")} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 md:px-6">
        {collapseTitle(kicker, title, hint, value)}
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-300 transition group-open:rotate-180">▼</span>
      </summary>
      <div className="border-t border-white/10 px-5 py-5 md:px-6">{children}</div>
    </details>
  );
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(date);
}

function dayKey(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function daysAgo(count: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - count);
  return date;
}

function withinDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= daysAgo(days);
}

function countBy<T>(rows: T[], keyBuilder: (row: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyBuilder(row)?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function countMany(values: string[][]) {
  const counts = new Map<string, number>();
  for (const list of values) {
    for (const raw of list) {
      const key = raw.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildDailySeries(lastDays: number, sources: Array<{ key: string; rows: string[] }>) {
  const days: string[] = [];
  for (let offset = lastDays - 1; offset >= 0; offset -= 1) {
    const date = daysAgo(offset);
    days.push(date.toISOString().slice(0, 10));
  }

  return days.map((day) => {
    const point: Record<string, string | number> = { day };
    for (const source of sources) {
      point[source.key] = source.rows.filter((value) => dayKey(value) === day).length;
    }
    return point;
  });
}

function topReleaseRows(rows: ReleaseMetricRow[], predicate: (row: ReleaseMetricRow) => boolean) {
  const counts = new Map<string, { title: string; artist: string; value: number }>();
  for (const row of rows) {
    if (!predicate(row)) continue;
    const key = row.release_uri;
    const current = counts.get(key) ?? { title: row.title || "Sin titulo", artist: row.artist || "Sin artista", value: 0 };
    current.value += 1;
    counts.set(key, current);
  }
  return Array.from(counts.entries())
    .map(([uri, value]) => ({ uri, ...value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

const PIE = ["#22d3ee", "#60a5fa", "#f59e0b", "#f472b6", "#34d399", "#f87171", "#a78bfa"];

export default function MetricsDashboard({
  profiles,
  subscriptions,
  searches,
  releases,
  yearlessHits,
}: {
  profiles: ProfileMetricRow[];
  subscriptions: SubscriptionMetricRow[];
  searches: SearchMetricRow[];
  releases: ReleaseMetricRow[];
  yearlessHits: YearlessReleaseHit[];
}) {
  const computed = useMemo(() => {
    const totalUsers = profiles.length;
    const activeToday = profiles.filter((row) => withinDays(row.last_seen_at, 1)).length;
    const active7d = profiles.filter((row) => withinDays(row.last_seen_at, 7)).length;
    const active30d = profiles.filter((row) => withinDays(row.last_seen_at, 30)).length;
    const bypassUsers = profiles.filter((row) => row.bypass_subscription).length;
    const adminUsers = profiles.filter((row) => row.is_admin).length;

    const paidStatuses = new Set(["active", "trialing"]);
    const paidSubscriptions = subscriptions.filter((row) => paidStatuses.has(row.status));
    const unpaidSubscriptions = subscriptions.filter((row) => !paidStatuses.has(row.status));
    const subscriptionsByStatus = countBy(subscriptions, (row) => row.status).slice(0, 7);
    const customerWithoutSubscription = subscriptions.filter((row) => row.stripe_customer_id && !row.stripe_subscription_id).length;

    const totalSearches = searches.length;
    const searches7d = searches.filter((row) => withinDays(row.created_at, 7));
    const searches30d = searches.filter((row) => withinDays(row.created_at, 30));
    const failedSearches = searches.filter((row) => row.status === "failed").length;
    const abortedSearches = searches.filter((row) => row.status === "aborted").length;
    const avgResults = searches.length ? (searches.reduce((sum, row) => sum + (row.result_count || 0), 0) / searches.length).toFixed(1) : "0.0";
    const uniqueSearchUsers7d = new Set(searches7d.map((row) => row.user_id)).size;
    const searchStatusData = countBy(searches, (row) => row.status);
    const topGenres = countMany(searches.map((row) => row.filters.genres ?? [])).slice(0, 8);
    const topStyles = countMany(searches.map((row) => row.filters.styles ?? [])).slice(0, 8);
    const topCountries = countMany(searches.map((row) => row.filters.countries_selected ?? [])).slice(0, 8);
    const topFormats = countMany(searches.map((row) => row.filters.formats_selected ?? [])).slice(0, 8);
    const toggleUsage = [
      { name: "Sin año", value: searches.filter((row) => row.filters.sin_anyo).length },
      { name: "Solo en venta", value: searches.filter((row) => row.filters.solo_en_venta).length },
      { name: "Not On Label", value: searches.filter((row) => row.filters.not_on_label_only).length },
      { name: "Excluir Various", value: searches.filter((row) => row.filters.exclude_various).length },
    ];

    const releaseFavorites = releases.filter((row) => row.is_favorite).length;
    const releaseListened = releases.filter((row) => row.listened).length;
    const topFavoriteReleases = topReleaseRows(releases, (row) => row.is_favorite);
    const topListenedReleases = topReleaseRows(releases, (row) => row.listened);
    const savedGenres = countMany(releases.map((row) => row.genres ?? [])).slice(0, 8);
    const savedStyles = countMany(releases.map((row) => row.styles ?? [])).slice(0, 8);
    const yearlessTotalHits = yearlessHits.reduce((sum, row) => sum + row.times_found, 0);
    const topYearless = [...yearlessHits].sort((a, b) => b.times_found - a.times_found).slice(0, 10);

    const growthSeries = buildDailySeries(30, [
      { key: "registeredUsers", rows: profiles.map((row) => row.created_at) },
      { key: "activeUsers", rows: profiles.map((row) => row.last_seen_at || "") },
      { key: "searches", rows: searches.map((row) => row.created_at) },
      { key: "subscriptions", rows: subscriptions.map((row) => row.created_at) },
    ]);

    return {
      totalUsers,
      activeToday,
      active7d,
      active30d,
      bypassUsers,
      adminUsers,
      paidSubscriptions: paidSubscriptions.length,
      unpaidSubscriptions: unpaidSubscriptions.length,
      customerWithoutSubscription,
      subscriptionsByStatus,
      totalSearches,
      searches7d: searches7d.length,
      searches30d: searches30d.length,
      failedSearches,
      abortedSearches,
      avgResults,
      uniqueSearchUsers7d,
      searchStatusData,
      topGenres,
      topStyles,
      topCountries,
      topFormats,
      toggleUsage,
      releaseFavorites,
      releaseListened,
      topFavoriteReleases,
      topListenedReleases,
      savedGenres,
      savedStyles,
      yearlessCount: yearlessHits.length,
      yearlessTotalHits,
      topYearless,
      growthSeries,
      registeredToPaidPct: totalUsers ? Math.round((paidSubscriptions.length / totalUsers) * 100) : 0,
      registeredToAccessPct: totalUsers ? Math.round(((paidSubscriptions.length + bypassUsers) / totalUsers) * 100) : 0,
    };
  }, [profiles, subscriptions, searches, releases, yearlessHits]);

  return (
    <div className="space-y-6">
      <Fold kicker="Executive" title="Resumen ejecutivo" hint="KPIs clave de crecimiento, acceso y uso real del producto." value={`${computed.totalUsers} usuarios`} defaultOpen>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Usuarios totales" value={computed.totalUsers} hint="Cuentas registradas en profiles." />
          <MetricCard label="Activos 7 días" value={computed.active7d} hint="Usuarios con actividad reciente." />
          <MetricCard label="Subs activas" value={computed.paidSubscriptions} hint="Estados active o trialing." />
          <MetricCard label="Búsquedas 30 días" value={computed.searches30d} hint="Carga real del Finder en el último mes." />
          <MetricCard label="Conversión a pago" value={`${computed.registeredToPaidPct}%`} hint="Registrados que llegaron a active/trialing." />
          <MetricCard label="Conversión a acceso" value={`${computed.registeredToAccessPct}%`} hint="Pago o bypass manual." />
          <MetricCard label="Sin año detectados" value={computed.yearlessCount} hint="Releases globales pendientes de revisar." />
          <MetricCard label="Bypass manual" value={computed.bypassUsers} hint="Usuarios con acceso manual habilitado." />
        </div>
      </Fold>

      <Fold kicker="Growth" title="Crecimiento y actividad" hint="Registros, actividad reciente, búsquedas y suscripciones por día." value="30 días">
        <div className="space-y-4">
          <details className={panel("p-0 group")} open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-white"><span className="font-semibold">Serie diaria</span><span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:rotate-180">▼</span></summary>
            <div className="border-t border-white/10 p-5">
              <div className="h-[360px] w-full">
                <ResponsiveContainer>
                  <LineChart data={computed.growthSeries}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={formatDay} stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip labelFormatter={(value) => formatDay(String(value))} contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,28,0.94)", color: "#f4f4f5" }} />
                    <Legend />
                    <Line type="monotone" dataKey="registeredUsers" name="Registros" stroke="#22d3ee" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="activeUsers" name="Activos" stroke="#60a5fa" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="searches" name="Búsquedas" stroke="#f59e0b" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="subscriptions" name="Subscripciones" stroke="#34d399" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </details>
        </div>
      </Fold>

      <Fold kicker="Billing" title="Negocio y suscripción" hint="Estados de pago, acceso real y cuentas que necesitan revisión." value={`${computed.paidSubscriptions} activas`}>
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <details className={panel("p-0 group")} open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-white"><span className="font-semibold">Distribución por estado</span><span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:rotate-180">▼</span></summary>
            <div className="border-t border-white/10 p-5">
              <div className="h-[320px] w-full">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={computed.subscriptionsByStatus} dataKey="value" nameKey="name" outerRadius={110} innerRadius={60}>
                      {computed.subscriptionsByStatus.map((entry, index) => <Cell key={entry.name} fill={PIE[index % PIE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,28,0.94)", color: "#f4f4f5" }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </details>

          <details className={panel("p-0 group")} open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-white"><span className="font-semibold">Alertas de negocio</span><span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:rotate-180">▼</span></summary>
            <div className="grid gap-4 border-t border-white/10 p-5 md:grid-cols-2">
              <MetricCard label="Suscripciones no activas" value={computed.unpaidSubscriptions} hint="Past due, canceled, inactive o similares." />
              <MetricCard label="Customer sin sub" value={computed.customerWithoutSubscription} hint="Casos para revisar webhooks o intentos incompletos." />
              <MetricCard label="Admins" value={computed.adminUsers} hint="Usuarios con visibilidad total del panel." />
              <MetricCard label="Bypass manual" value={computed.bypassUsers} hint="Accesos especiales para testers o soporte." />
            </div>
          </details>
        </div>
      </Fold>

      <Fold kicker="Usage" title="Uso del buscador" hint="Volumen, calidad de resultados, filtros más usados y toggles reales." value={`${computed.totalSearches} búsquedas`}>
        <div className="space-y-4">
          <details className={panel("p-0 group")} open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-white"><span className="font-semibold">Rendimiento de búsquedas</span><span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:rotate-180">▼</span></summary>
            <div className="grid gap-4 border-t border-white/10 p-5 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Búsquedas 7 días" value={computed.searches7d} hint="Uso reciente del Finder." />
              <MetricCard label="Usuarios buscando 7 días" value={computed.uniqueSearchUsers7d} hint="Alcance real de uso semanal." />
              <MetricCard label="Media resultados" value={computed.avgResults} hint="Resultados por búsqueda guardada." />
              <MetricCard label="Abortadas / fallidas" value={`${computed.abortedSearches} / ${computed.failedSearches}`} hint="Señal de UX o problemas de búsqueda." />
            </div>
          </details>

          <details className={panel("p-0 group")} open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-white"><span className="font-semibold">Estado y filtros usados</span><span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:rotate-180">▼</span></summary>
            <div className="grid gap-4 border-t border-white/10 p-5 xl:grid-cols-2">
              <div className="h-[300px] w-full rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <ResponsiveContainer>
                  <BarChart data={computed.searchStatusData}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="name" stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,28,0.94)", color: "#f4f4f5" }} />
                    <Bar dataKey="value" name="Búsquedas" fill="#22d3ee" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[{ title: "Top géneros", rows: computed.topGenres }, { title: "Top estilos", rows: computed.topStyles }, { title: "Top países", rows: computed.topCountries }, { title: "Top formatos", rows: computed.topFormats }].map((block) => (
                  <div key={block.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{block.title}</p>
                    <div className="mt-4 space-y-2 text-sm text-zinc-300">
                      {block.rows.slice(0, 5).map((row) => <div key={row.name} className="flex items-center justify-between gap-3"><span className="truncate">{row.name}</span><span className="text-zinc-500">{row.value}</span></div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>

          <details className={panel("p-0 group")}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-white"><span className="font-semibold">Uso de toggles</span><span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:rotate-180">▼</span></summary>
            <div className="border-t border-white/10 p-5">
              <div className="h-[280px] w-full">
                <ResponsiveContainer>
                  <BarChart data={computed.toggleUsage}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="name" stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,28,0.94)", color: "#f4f4f5" }} />
                    <Bar dataKey="value" fill="#60a5fa" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </details>
        </div>
      </Fold>

      <Fold kicker="Catalog" title="Calidad de catálogo" hint="Releases sin año, favoritos, escuchados y señales de colección." value={`${computed.yearlessCount} sin año`}>
        <div className="space-y-4">
          <details className={panel("p-0 group")} open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-white"><span className="font-semibold">Releases sin año</span><span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:rotate-180">▼</span></summary>
            <div className="grid gap-4 border-t border-white/10 p-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard label="Releases únicos" value={computed.yearlessCount} hint="Número de referencias sin año detectadas." />
                <MetricCard label="Hits acumulados" value={computed.yearlessTotalHits} hint="Veces que han aparecido en búsquedas." />
              </div>
              <div className="space-y-3">
                {computed.topYearless.slice(0, 6).map((item) => (
                  <article key={item.release_uri} className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                      {item.thumb ? <Image src={item.thumb} alt={item.title || "Release"} fill className="object-cover" unoptimized /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{item.title || "Sin título"}</p>
                      <p className="truncate text-xs text-zinc-400">{item.artist || "Sin artista"}</p>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">{item.times_found} hits</p>
                  </article>
                ))}
              </div>
            </div>
          </details>

          <details className={panel("p-0 group")}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-white"><span className="font-semibold">Favoritos y escuchados</span><span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:rotate-180">▼</span></summary>
            <div className="grid gap-4 border-t border-white/10 p-5 xl:grid-cols-2">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <MetricCard label="Favoritos" value={computed.releaseFavorites} hint="Marcados por usuarios." />
                  <MetricCard label="Escuchados" value={computed.releaseListened} hint="Releases escuchados guardados." />
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Top favoritos</p>
                  <div className="mt-4 space-y-2 text-sm text-zinc-300">
                    {computed.topFavoriteReleases.map((row) => <div key={row.uri} className="flex items-center justify-between gap-3"><span className="truncate">{row.artist} - {row.title}</span><span className="text-zinc-500">{row.value}</span></div>)}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Top escuchados</p>
                  <div className="mt-4 space-y-2 text-sm text-zinc-300">
                    {computed.topListenedReleases.map((row) => <div key={row.uri} className="flex items-center justify-between gap-3"><span className="truncate">{row.artist} - {row.title}</span><span className="text-zinc-500">{row.value}</span></div>)}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Géneros guardados</p>
                    <div className="mt-4 space-y-2 text-sm text-zinc-300">{computed.savedGenres.slice(0, 5).map((row) => <div key={row.name} className="flex items-center justify-between gap-3"><span className="truncate">{row.name}</span><span className="text-zinc-500">{row.value}</span></div>)}</div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Estilos guardados</p>
                    <div className="mt-4 space-y-2 text-sm text-zinc-300">{computed.savedStyles.slice(0, 5).map((row) => <div key={row.name} className="flex items-center justify-between gap-3"><span className="truncate">{row.name}</span><span className="text-zinc-500">{row.value}</span></div>)}</div>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </Fold>

      <Fold kicker="Ops" title="Operación y soporte" hint="Señales para detectar problemas reales, fricción y cuentas a revisar." value="monitorización">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Search failed" value={computed.failedSearches} hint="Errores reportados desde búsquedas guardadas." />
          <MetricCard label="Search aborted" value={computed.abortedSearches} hint="Búsquedas detenidas por el usuario o navegación previa." />
          <MetricCard label="Customers sin sub" value={computed.customerWithoutSubscription} hint="Posibles incidencias de checkout/webhook." />
          <MetricCard label="Activos hoy" value={computed.activeToday} hint="Pulso en tiempo casi real del producto." />
        </div>
      </Fold>
    </div>
  );
}

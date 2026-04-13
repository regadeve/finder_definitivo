"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

type BillingInvoiceRow = {
  stripe_invoice_id: string;
  user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: string;
  livemode: boolean;
  currency: string | null;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  subtotal: number;
  tax: number;
  total: number;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type BillingEventRow = {
  stripe_event_id: string;
  event_type: string;
  livemode: boolean;
  user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
  received_at: string;
};

function panel(extra = "") {
  return `rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl ${extra}`;
}

function fmtDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(date);
}

function toDayKey(value: string | null | undefined) {
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

function isAfterDate(value: string | null | undefined, since: Date | null) {
  if (!since) return Boolean(value);
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= since;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sin dato";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
    days.push(daysAgo(offset).toISOString().slice(0, 10));
  }

  return days.map((day) => {
    const point: Record<string, string | number> = { day };
    for (const source of sources) {
      point[source.key] = source.rows.filter((value) => toDayKey(value) === day).length;
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

function HeroStat({ label, value, hint, accent = "cyan" }: { label: string; value: string | number; hint: string; accent?: "cyan" | "emerald" | "amber" | "rose" | "blue" }) {
  const accentMap = {
    cyan: "from-cyan-400/22 to-cyan-500/6 text-cyan-100 ring-cyan-300/20",
    emerald: "from-emerald-400/22 to-emerald-500/6 text-emerald-100 ring-emerald-300/20",
    amber: "from-amber-400/22 to-amber-500/6 text-amber-100 ring-amber-300/20",
    rose: "from-rose-400/22 to-rose-500/6 text-rose-100 ring-rose-300/20",
    blue: "from-blue-400/22 to-blue-500/6 text-blue-100 ring-blue-300/20",
  } as const;

  return (
    <article className={`relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br ${accentMap[accent]} p-4 ring-1`}>
      <div className="absolute inset-x-0 top-0 h-px bg-white/30" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-300/90">{label}</p>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/75">
          {accent === "emerald" ? "Revenue" : accent === "amber" ? "Catalog" : accent === "rose" ? "Risk" : accent === "blue" ? "Search" : "Pulse"}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold text-white md:text-4xl">{value}</p>
      <p className="mt-2 max-w-xs text-xs leading-5 text-zinc-300/80 md:text-sm">{hint}</p>
    </article>
  );
}

function KpiStrip({ label, value, delta, tone = "cyan" }: { label: string; value: string | number; delta: string; tone?: "cyan" | "emerald" | "amber" | "rose" | "blue" }) {
  const tones = {
    cyan: "border-cyan-300/18 bg-cyan-300/8 text-cyan-100",
    emerald: "border-emerald-300/18 bg-emerald-300/8 text-emerald-100",
    amber: "border-amber-300/18 bg-amber-300/8 text-amber-100",
    rose: "border-rose-300/18 bg-rose-300/8 text-rose-100",
    blue: "border-blue-300/18 bg-blue-300/8 text-blue-100",
  } as const;

  return (
    <div className={`rounded-2xl border px-3.5 py-3 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-300/80">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-xl font-semibold text-white md:text-2xl">{value}</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-300/70">{delta}</p>
      </div>
    </div>
  );
}

function AlertTile({ tone, title, value, detail }: { tone: "rose" | "amber" | "blue" | "emerald"; title: string; value: string | number; detail: string }) {
  const tones = {
    rose: "border-rose-300/18 bg-rose-300/10 text-rose-100",
    amber: "border-amber-300/18 bg-amber-300/10 text-amber-100",
    blue: "border-blue-300/18 bg-blue-300/10 text-blue-100",
    emerald: "border-emerald-300/18 bg-emerald-300/10 text-emerald-100",
  } as const;

  return (
    <article className={`rounded-[20px] border p-3.5 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-200/75">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-200/80 md:text-sm">{detail}</p>
    </article>
  );
}

function SectionChip({ tone, icon, label }: { tone: "cyan" | "emerald" | "amber" | "rose" | "blue" | "violet"; icon: string; label: string }) {
  const tones = {
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    rose: "border-rose-300/20 bg-rose-300/10 text-rose-100",
    blue: "border-blue-300/20 bg-blue-300/10 text-blue-100",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-100",
  } as const;

  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${tones[tone]}`}>{icon} {label}</span>;
}

function MiniFold({ title, caption, defaultOpen = true, children }: { title: string; caption: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className={panel("group p-0")} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 md:px-5 md:py-4">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{caption}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-300 transition group-open:rotate-180">▼</span>
      </summary>
      <div className="border-t border-white/10 p-4 md:p-5">{children}</div>
    </details>
  );
}

function Fold({ kicker, title, hint, value, defaultOpen = false, children }: { kicker: string; title: string; hint: string; value?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className={panel("group p-0")} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 md:px-5 md:py-4.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300/85">{kicker}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white md:text-2xl">{title}</h2>
              <p className="mt-1.5 max-w-3xl text-xs leading-5 text-zinc-400 md:text-sm">{hint}</p>
            </div>
            {value ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">{value}</p> : null}
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-300 transition group-open:rotate-180">▼</span>
      </summary>
      <div className="border-t border-white/10 px-4 py-4 md:px-5 md:py-5">{children}</div>
    </details>
  );
}

function HorizontalRank({ rows, emptyLabel = "Sin datos" }: { rows: Array<{ name: string; value: number }>; emptyLabel?: string }) {
  const max = rows[0]?.value ?? 0;
  if (!rows.length) {
    return <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-500">{emptyLabel}</div>;
  }
  return (
    <div className="space-y-3">
      {rows.slice(0, 6).map((row) => (
        <div key={row.name} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-zinc-200">{row.name}</span>
            <span className="text-zinc-500">{row.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.9),rgba(96,165,250,0.9))]" style={{ width: `${max ? (row.value / max) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const PIE = ["#22d3ee", "#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#f87171", "#a78bfa"];

const RANGE_OPTIONS = [
  { key: "7d", label: "7 días", days: 7 },
  { key: "30d", label: "30 días", days: 30 },
  { key: "90d", label: "3 meses", days: 90 },
  { key: "180d", label: "6 meses", days: 180 },
  { key: "365d", label: "1 año", days: 365 },
  { key: "all", label: "Desde el principio", days: null },
] as const;

type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

export default function MetricsDashboard({
  profiles,
  subscriptions,
  searches,
  releases,
  yearlessHits,
  billingInvoices,
  billingEvents,
}: {
  profiles: ProfileMetricRow[];
  subscriptions: SubscriptionMetricRow[];
  searches: SearchMetricRow[];
  releases: ReleaseMetricRow[];
  yearlessHits: YearlessReleaseHit[];
  billingInvoices: BillingInvoiceRow[];
  billingEvents: BillingEventRow[];
}) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [userQuery, setUserQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const computed = useMemo(() => {
    const selectedRange = RANGE_OPTIONS.find((option) => option.key === range) ?? RANGE_OPTIONS[1];
    const rangeStart = selectedRange.days === null ? null : daysAgo(selectedRange.days);
    const scopedProfiles = rangeStart ? profiles.filter((row) => isAfterDate(row.created_at, rangeStart) || isAfterDate(row.last_seen_at, rangeStart)) : profiles;
    const scopedSubscriptions = rangeStart ? subscriptions.filter((row) => isAfterDate(row.created_at, rangeStart) || isAfterDate(row.updated_at, rangeStart)) : subscriptions;
    const scopedSearches = rangeStart ? searches.filter((row) => isAfterDate(row.created_at, rangeStart)) : searches;
    const scopedReleases = rangeStart ? releases.filter((row) => isAfterDate(row.updated_at, rangeStart) || isAfterDate(row.listened_at, rangeStart)) : releases;
    const scopedYearless = rangeStart ? yearlessHits.filter((row) => isAfterDate(row.last_found_at, rangeStart) || isAfterDate(row.first_found_at, rangeStart)) : yearlessHits;

    const totalUsers = scopedProfiles.length;
    const activeToday = scopedProfiles.filter((row) => withinDays(row.last_seen_at, 1)).length;
    const active7d = scopedProfiles.filter((row) => withinDays(row.last_seen_at, 7)).length;
    const active30d = scopedProfiles.filter((row) => withinDays(row.last_seen_at, 30)).length;
    const newToday = scopedProfiles.filter((row) => withinDays(row.created_at, 1)).length;
    const new7d = scopedProfiles.filter((row) => withinDays(row.created_at, 7)).length;
    const new30d = scopedProfiles.filter((row) => withinDays(row.created_at, 30)).length;
    const bypassUsers = profiles.filter((row) => row.bypass_subscription).length;
    const adminUsers = profiles.filter((row) => row.is_admin).length;

    const paidStatuses = new Set(["active", "trialing"]);
    const paidSubscriptions = scopedSubscriptions.filter((row) => paidStatuses.has(row.status));
    const unpaidSubscriptions = scopedSubscriptions.filter((row) => !paidStatuses.has(row.status));
    const subscriptionsByStatus = countBy(scopedSubscriptions, (row) => row.status).slice(0, 7);
    const customerWithoutSubscription = scopedSubscriptions.filter((row) => row.stripe_customer_id && !row.stripe_subscription_id).length;
    const cancelAtPeriodEnd = scopedSubscriptions.filter((row) => row.cancel_at_period_end).length;

    const totalSearches = scopedSearches.length;
    const searchesToday = scopedSearches.filter((row) => withinDays(row.created_at, 1));
    const searches7d = scopedSearches.filter((row) => withinDays(row.created_at, 7));
    const searches30d = scopedSearches.filter((row) => withinDays(row.created_at, 30));
    const failedSearches = scopedSearches.filter((row) => row.status === "failed").length;
    const abortedSearches = scopedSearches.filter((row) => row.status === "aborted").length;
    const completedSearches = scopedSearches.filter((row) => row.status === "completed").length;
    const avgResults = scopedSearches.length ? (scopedSearches.reduce((sum, row) => sum + (row.result_count || 0), 0) / scopedSearches.length).toFixed(1) : "0.0";
    const uniqueSearchUsers7d = new Set(searches7d.map((row) => row.user_id)).size;
    const uniqueSearchUsers30d = new Set(searches30d.map((row) => row.user_id)).size;
    const searchStatusData = countBy(scopedSearches, (row) => row.status);
    const topGenres = countMany(scopedSearches.map((row) => row.filters.genres ?? [])).slice(0, 8);
    const topStyles = countMany(scopedSearches.map((row) => row.filters.styles ?? [])).slice(0, 8);
    const topCountries = countMany(scopedSearches.map((row) => row.filters.countries_selected ?? [])).slice(0, 8);
    const topFormats = countMany(scopedSearches.map((row) => row.filters.formats_selected ?? [])).slice(0, 8);
    const toggleUsage = [
      { name: "Sin año", value: scopedSearches.filter((row) => row.filters.sin_anyo).length },
      { name: "Solo en venta", value: scopedSearches.filter((row) => row.filters.solo_en_venta).length },
      { name: "Not On Label", value: scopedSearches.filter((row) => row.filters.not_on_label_only).length },
      { name: "Excluir Various", value: scopedSearches.filter((row) => row.filters.exclude_various).length },
    ];

    const releaseFavorites = scopedReleases.filter((row) => row.is_favorite).length;
    const releaseListened = scopedReleases.filter((row) => row.listened).length;
    const topFavoriteReleases = topReleaseRows(scopedReleases, (row) => row.is_favorite);
    const topListenedReleases = topReleaseRows(scopedReleases, (row) => row.listened);
    const savedGenres = countMany(scopedReleases.map((row) => row.genres ?? [])).slice(0, 8);
    const savedStyles = countMany(scopedReleases.map((row) => row.styles ?? [])).slice(0, 8);
    const yearlessTotalHits = scopedYearless.reduce((sum, row) => sum + row.times_found, 0);
    const topYearless = [...scopedYearless].sort((a, b) => b.times_found - a.times_found).slice(0, 10);

    const dailySeries = buildDailySeries(30, [
      { key: "registeredUsers", rows: scopedProfiles.map((row) => row.created_at) },
      { key: "activeUsers", rows: scopedProfiles.map((row) => row.last_seen_at || "") },
      { key: "searches", rows: scopedSearches.map((row) => row.created_at) },
      { key: "subscriptions", rows: scopedSubscriptions.map((row) => row.created_at) },
    ]);

    const scopedBillingInvoices = rangeStart ? billingInvoices.filter((row) => isAfterDate(row.created_at, rangeStart) || isAfterDate(row.paid_at, rangeStart)) : billingInvoices;
    const scopedBillingEvents = rangeStart ? billingEvents.filter((row) => isAfterDate(row.created_at, rangeStart)) : billingEvents;

    const paidInvoices = scopedBillingInvoices.filter((row) => row.status === "paid");
    const failedInvoices = scopedBillingInvoices.filter((row) => row.status === "open" || row.status === "uncollectible" || row.status === "void");
    const totalRevenue = paidInvoices.reduce((sum, row) => sum + (row.amount_paid || 0), 0);
    const recurringRevenue = paidInvoices
      .filter((row) => paidStatuses.has(subscriptions.find((item) => item.stripe_subscription_id === row.stripe_subscription_id)?.status || ""))
      .reduce((sum, row) => sum + (row.amount_paid || 0), 0);
    const invoicesByStatus = countBy(scopedBillingInvoices, (row) => row.status).slice(0, 7);
    const recentBillingEvents = countBy(scopedBillingEvents, (row) => row.event_type).slice(0, 6);

    const usersDirectory = profiles
      .map((profile) => {
        const userSubscription = subscriptions.find((row) => row.user_id === profile.id) ?? null;
        const userSearches = searches.filter((row) => row.user_id === profile.id);
        const userReleases = releases.filter((row) => row.user_id === profile.id);
        const favoriteCount = userReleases.filter((row) => row.is_favorite).length;
        const listenedCount = userReleases.filter((row) => row.listened).length;

        return {
          ...profile,
          subscription: userSubscription,
          searchCount: userSearches.length,
          lastSearchAt: userSearches[0]?.created_at ?? null,
          favoriteCount,
          listenedCount,
        };
      })
      .sort((a, b) => {
        const aDate = new Date(a.last_seen_at || a.created_at).getTime();
        const bDate = new Date(b.last_seen_at || b.created_at).getTime();
        return bDate - aDate;
      });

    return {
      selectedRange,
      totalUsers,
      activeToday,
      active7d,
      active30d,
      newToday,
      new7d,
      new30d,
      bypassUsers,
      adminUsers,
      paidSubscriptions: paidSubscriptions.length,
      unpaidSubscriptions: unpaidSubscriptions.length,
      customerWithoutSubscription,
      cancelAtPeriodEnd,
      subscriptionsByStatus,
      totalSearches,
      searchesToday: searchesToday.length,
      searches7d: searches7d.length,
      searches30d: searches30d.length,
      failedSearches,
      abortedSearches,
      completedSearches,
      avgResults,
      uniqueSearchUsers7d,
      uniqueSearchUsers30d,
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
      yearlessCount: scopedYearless.length,
      yearlessTotalHits,
      topYearless,
      dailySeries,
      usersDirectory,
      totalRevenue,
      recurringRevenue,
      paidInvoices: paidInvoices.length,
      failedInvoices: failedInvoices.length,
      invoicesByStatus,
      recentBillingEvents,
      registeredToPaidPct: totalUsers ? Math.round((paidSubscriptions.length / totalUsers) * 100) : 0,
      registeredToAccessPct: totalUsers ? Math.round(((paidSubscriptions.length + bypassUsers) / totalUsers) * 100) : 0,
      searchSuccessPct: totalSearches ? Math.round((completedSearches / totalSearches) * 100) : 0,
      yearlessPct: releases.length ? Math.round((yearlessHits.length / releases.length) * 100) : 0,
      activeTrend: active30d - active7d,
      searchTrend: searches30d.length - searches7d.length,
    };
  }, [profiles, subscriptions, searches, releases, yearlessHits, billingInvoices, billingEvents, range]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return computed.usersDirectory;
    return computed.usersDirectory.filter((user) => {
      return [user.full_name || "", user.email || "", user.id].some((value) => value.toLowerCase().includes(q));
    });
  }, [computed.usersDirectory, userQuery]);

  const selectedUser = useMemo(() => {
    return filteredUsers.find((user) => user.id === selectedUserId) ?? computed.usersDirectory.find((user) => user.id === selectedUserId) ?? filteredUsers[0] ?? computed.usersDirectory[0] ?? null;
  }, [filteredUsers, computed.usersDirectory, selectedUserId]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
        <HeroStat label="Usuarios" value={computed.totalUsers} hint={`${computed.new30d} altas en 30 días · ${computed.active7d} activos en 7 días`} accent="cyan" />
        <HeroStat label="Suscripciones activas" value={computed.paidSubscriptions} hint={`${computed.registeredToPaidPct}% de conversión a pago`} accent="emerald" />
        <HeroStat label="Búsquedas 30 días" value={computed.searches30d} hint={`${computed.searchSuccessPct}% completadas · media ${computed.avgResults} resultados`} accent="blue" />
        <HeroStat label="Catálogo sin año" value={computed.yearlessCount} hint={`${computed.yearlessTotalHits} hits acumulados · ${computed.yearlessPct}% del catálogo guardado`} accent="amber" />
      </section>

      <section className="flex flex-wrap gap-2">
        <SectionChip tone="cyan" icon="◉" label="Crecimiento" />
        <SectionChip tone="emerald" icon="€" label="Suscripción" />
        <SectionChip tone="blue" icon="⌕" label="Búsqueda" />
        <SectionChip tone="amber" icon="◎" label="Catálogo" />
        <SectionChip tone="rose" icon="!" label="Riesgo" />
        <SectionChip tone="violet" icon="⚙" label="Operación" />
      </section>

      <section className={panel("p-4 md:p-5")}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-zinc-500">Rango temporal</p>
            <p className="mt-2 text-sm text-zinc-300">Filtra métricas y gráficos por ventana temporal.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRange(option.key)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${range === option.key ? "border border-cyan-300/30 bg-cyan-300/20 text-cyan-100" : "border border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.08]"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4">
        <AlertTile tone="rose" title="Incidencia billing" value={computed.customerWithoutSubscription} detail="Customers con checkout o alta incompleta que conviene revisar." />
        <AlertTile tone="amber" title="Búsquedas cortadas" value={computed.abortedSearches} detail="Abortadas antes de acabar; posible fricción de UX o navegación." />
        <AlertTile tone="blue" title="Usuarios buscando" value={computed.uniqueSearchUsers30d} detail="Usuarios únicos que han usado Finder durante 30 días." />
        <AlertTile tone="emerald" title="Conversión a acceso" value={`${computed.registeredToAccessPct}%`} detail="Porcentaje de registrados con pago activo o bypass manual." />
      </section>

      <Fold kicker="Executive" title="Resumen ejecutivo" hint="Fotografía rápida del estado del negocio, la actividad y la calidad del catálogo." value={`${computed.totalUsers} usuarios`} defaultOpen>
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          <KpiStrip label="Altas" value={computed.new30d} delta={`${computed.new7d} en 7d`} tone="cyan" />
          <KpiStrip label="Activos" value={computed.active30d} delta={`${computed.activeToday} hoy · Δ ${computed.activeTrend >= 0 ? "+" : ""}${computed.activeTrend}`} tone="blue" />
          <KpiStrip label="Pago" value={`${computed.registeredToPaidPct}%`} delta={`${computed.paidSubscriptions} activas`} tone="emerald" />
          <KpiStrip label="Riesgo" value={computed.customerWithoutSubscription} delta={`${computed.unpaidSubscriptions} no activas`} tone="rose" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4">
          <HeroStat label="Altas hoy" value={computed.newToday} hint={`${computed.new7d} en 7 días`} accent="cyan" />
          <HeroStat label="Activos hoy" value={computed.activeToday} hint={`${computed.active30d} usuarios con actividad en 30 días`} accent="blue" />
          <HeroStat label="Acceso manual" value={computed.bypassUsers} hint={`${computed.adminUsers} cuentas admin + bypass`} accent="rose" />
          <HeroStat label="Riesgo billing" value={computed.customerWithoutSubscription} hint={`${computed.cancelAtPeriodEnd} cancelan al final de periodo`} accent="amber" />
        </div>
      </Fold>

      <Fold kicker="Growth" title="Crecimiento y actividad" hint="Series diarias más visuales y mapa de calor del ritmo del producto." value="30 días">
        <div className="space-y-4">
          <MiniFold title="Series acumuladas" caption="Registros, activos, búsquedas y suscripciones en una sola vista." defaultOpen>
            <div className="h-[380px] w-full">
              <ResponsiveContainer>
                <AreaChart data={computed.dailySeries}>
                  <defs>
                    <linearGradient id="g-users" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22d3ee" stopOpacity={0.32} /><stop offset="95%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
                    <linearGradient id="g-searches" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#60a5fa" stopOpacity={0.28} /><stop offset="95%" stopColor="#60a5fa" stopOpacity={0} /></linearGradient>
                    <linearGradient id="g-subs" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.26} /><stop offset="95%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={fmtDay} stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} minTickGap={18} />
                    <YAxis stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip labelFormatter={(value) => fmtDay(String(value))} contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,28,0.94)", color: "#f4f4f5" }} />
                  <Legend />
                  <Area type="monotone" dataKey="registeredUsers" stroke="#22d3ee" fill="url(#g-users)" strokeWidth={2.8} name="Registros" />
                  <Area type="monotone" dataKey="searches" stroke="#60a5fa" fill="url(#g-searches)" strokeWidth={2.6} name="Búsquedas" />
                  <Area type="monotone" dataKey="subscriptions" stroke="#34d399" fill="url(#g-subs)" strokeWidth={2.6} name="Subscripciones" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </MiniFold>

        </div>
      </Fold>

      <Fold kicker="Billing" title="Negocio y suscripción" hint="Embudo de acceso, estados de pago y alertas claras de billing." value={`${computed.paidSubscriptions} activas`}>
        <div className="space-y-4">
          <MiniFold title="Embudo y conversión" caption="Del registro al acceso efectivo.">
            <div className="grid gap-4 2xl:grid-cols-[0.8fr_1.2fr]">
              <div className="grid gap-4 md:grid-cols-2">
                <HeroStat label="Conversión a pago" value={`${computed.registeredToPaidPct}%`} hint={`${computed.paidSubscriptions}/${computed.totalUsers} usuarios`} accent="emerald" />
                <HeroStat label="Conversión a acceso" value={`${computed.registeredToAccessPct}%`} hint="Incluye bypass manual" accent="cyan" />
                <HeroStat label="No activas" value={computed.unpaidSubscriptions} hint="Estados no pagados o incompletos" accent="rose" />
                <HeroStat label="Customers sin sub" value={computed.customerWithoutSubscription} hint="Posibles incidencias de checkout" accent="amber" />
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Embudo operativo</p>
                <div className="mt-4 space-y-4">
                  {[
                    { label: "Registrados", value: computed.totalUsers, color: "bg-cyan-400" },
                    { label: "Con acceso", value: computed.paidSubscriptions + computed.bypassUsers, color: "bg-blue-400" },
                    { label: "Activas", value: computed.paidSubscriptions, color: "bg-emerald-400" },
                    { label: "Bypass manual", value: computed.bypassUsers, color: "bg-amber-400" },
                  ].map((step) => (
                    <div key={step.label}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-zinc-200">{step.label}</span>
                        <span className="text-zinc-500">{step.value}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/5">
                        <div className={`${step.color} h-full rounded-full`} style={{ width: `${computed.totalUsers ? (step.value / computed.totalUsers) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </MiniFold>

          <MiniFold title="Estados de suscripción" caption="Distribución visual por estado para detectar dónde se atasca el billing.">
            <div className="h-[320px] w-full rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={computed.subscriptionsByStatus} dataKey="value" nameKey="name" outerRadius={110} innerRadius={62} paddingAngle={3}>
                    {computed.subscriptionsByStatus.map((entry, index) => <Cell key={entry.name} fill={PIE[index % PIE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,28,0.94)", color: "#f4f4f5" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </MiniFold>

          <MiniFold title="Facturación real" caption="Datos reales de invoices sincronizadas desde Stripe vía webhook." defaultOpen>
            <div className="grid gap-4 2xl:grid-cols-[0.88fr_1.12fr]">
              <div className="grid gap-4 md:grid-cols-2">
                <HeroStat label="Revenue cobrado" value={`${(computed.totalRevenue / 100).toFixed(2)} EUR`} hint="Suma real de amount_paid en el rango" accent="emerald" />
                <HeroStat label="Revenue recurrente" value={`${(computed.recurringRevenue / 100).toFixed(2)} EUR`} hint="Pagos asociados a subscriptions activas/trialing" accent="cyan" />
                <HeroStat label="Invoices pagadas" value={computed.paidInvoices} hint="Cobros con estado paid" accent="blue" />
                <HeroStat label="Invoices con riesgo" value={computed.failedInvoices} hint="Open, uncollectible o void en el rango" accent="rose" />
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                <p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Estados de invoice</p>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer>
                    <BarChart data={computed.invoicesByStatus}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="name" stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} />
                      <YAxis stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,28,0.94)", color: "#f4f4f5" }} />
                      <Bar dataKey="value" fill="#34d399" radius={[12, 12, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
              <p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Eventos de billing recientes</p>
              <HorizontalRank rows={computed.recentBillingEvents} emptyLabel="Aún no hay eventos de billing sincronizados." />
            </div>
          </MiniFold>
        </div>
      </Fold>

      <Fold kicker="Usage" title="Uso del buscador" hint="Rendimiento, hábitos, toggles y filtros dominantes del Finder." value={`${computed.totalSearches} búsquedas`}>
        <div className="space-y-4">
          <MiniFold title="Rendimiento general" caption="Volumen y salud operativa del buscador." defaultOpen>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
              <HeroStat label="Búsquedas hoy" value={computed.searchesToday} hint={`${computed.searches7d} en 7 días`} accent="blue" />
              <HeroStat label="Usuarios buscando" value={computed.uniqueSearchUsers7d} hint={`${computed.uniqueSearchUsers30d} usuarios únicos en 30 días`} accent="cyan" />
              <HeroStat label="Media resultados" value={computed.avgResults} hint="Resultados encontrados por búsqueda guardada" accent="emerald" />
              <HeroStat label="Abortadas / fallidas" value={`${computed.abortedSearches} / ${computed.failedSearches}`} hint="Señal de fricción o problemas" accent="rose" />
            </div>
          </MiniFold>

          <MiniFold title="Embudo de búsqueda" caption="De volumen a éxito final, con foco en cuellos de botella.">
            <div className="grid gap-4 2xl:grid-cols-[0.85fr_1.15fr]">
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                <KpiStrip label="Total" value={computed.totalSearches} delta={`${computed.searchesToday} hoy · Δ ${computed.searchTrend >= 0 ? "+" : ""}${computed.searchTrend}`} tone="blue" />
                <KpiStrip label="Completadas" value={computed.completedSearches} delta={`${computed.searchSuccessPct}% éxito`} tone="emerald" />
                <KpiStrip label="Abortadas" value={computed.abortedSearches} delta="fricción" tone="amber" />
                <KpiStrip label="Fallidas" value={computed.failedSearches} delta="errores" tone="rose" />
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                <div className="space-y-4">
                  {[
                    { label: "Lanzadas", value: computed.totalSearches, color: "bg-blue-400" },
                    { label: "Completadas", value: computed.completedSearches, color: "bg-emerald-400" },
                    { label: "Abortadas", value: computed.abortedSearches, color: "bg-amber-400" },
                    { label: "Fallidas", value: computed.failedSearches, color: "bg-rose-400" },
                  ].map((step) => (
                    <div key={step.label}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-zinc-200">{step.label}</span>
                        <span className="text-zinc-500">{step.value}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/5">
                        <div className={`${step.color} h-full rounded-full`} style={{ width: `${computed.totalSearches ? (step.value / computed.totalSearches) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </MiniFold>

          <MiniFold title="Estados, toggles y tops" caption="Visualizaciones bonitas de qué hace realmente la gente.">
            <div className="grid gap-4 2xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Estado de búsquedas</p>
                  <div className="mt-4 h-[280px] w-full">
                    <ResponsiveContainer>
                      <BarChart data={computed.searchStatusData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="name" stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} />
                        <YAxis stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,28,0.94)", color: "#f4f4f5" }} />
                        <Bar dataKey="value" fill="#22d3ee" radius={[12, 12, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Uso de toggles</p>
                  <div className="mt-4 h-[280px] w-full">
                    <ResponsiveContainer>
                      <BarChart data={computed.toggleUsage} layout="vertical" margin={{ left: 24 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                        <XAxis type="number" stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis dataKey="name" type="category" stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} width={110} />
                        <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,28,0.94)", color: "#f4f4f5" }} />
                        <Bar dataKey="value" fill="#60a5fa" radius={[0, 12, 12, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"><p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Top géneros</p><HorizontalRank rows={computed.topGenres} /></div>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"><p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Top estilos</p><HorizontalRank rows={computed.topStyles} /></div>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"><p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Top países</p><HorizontalRank rows={computed.topCountries} /></div>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"><p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Top formatos</p><HorizontalRank rows={computed.topFormats} /></div>
              </div>
            </div>
          </MiniFold>
        </div>
      </Fold>

      <Fold kicker="Catalog" title="Calidad de catálogo" hint="Sin año, favoritos, escuchados y textura real de la colección creada por usuarios." value={`${computed.yearlessCount} sin año`}>
        <div className="space-y-4">
          <MiniFold title="Releases sin año" caption="Hallazgos raros detectados por cualquier usuario." defaultOpen>
            <div className="grid gap-4 2xl:grid-cols-[0.7fr_1.3fr]">
              <div className="grid gap-4 md:grid-cols-2">
                <HeroStat label="Releases únicos" value={computed.yearlessCount} hint="Referencias diferentes detectadas sin año" accent="amber" />
                <HeroStat label="Hits acumulados" value={computed.yearlessTotalHits} hint="Veces que el sistema los encontró" accent="amber" />
              </div>
              <div className="space-y-3">
                {computed.topYearless.slice(0, 6).map((item) => (
                  <article key={item.release_uri} className="flex items-center gap-4 rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                      {item.thumb ? <Image src={item.thumb} alt={item.title || "Release"} fill className="object-cover" unoptimized /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{item.title || "Sin título"}</p>
                      <p className="truncate text-xs text-zinc-400">{item.artist || "Sin artista"}</p>
                    </div>
                    <p className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">{item.times_found} hits</p>
                  </article>
                ))}
              </div>
            </div>
          </MiniFold>

          <MiniFold title="Favoritos, escuchados y taxonomía" caption="Qué está gustando más y qué estilos terminan guardados.">
            <div className="grid gap-4 2xl:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <HeroStat label="Favoritos" value={computed.releaseFavorites} hint="Marcados por usuarios" accent="blue" />
                  <HeroStat label="Escuchados" value={computed.releaseListened} hint="Confirmados como escuchados" accent="emerald" />
                </div>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"><p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Top favoritos</p><HorizontalRank rows={computed.topFavoriteReleases.map((row) => ({ name: `${row.artist} - ${row.title}`, value: row.value }))} /></div>
              </div>
              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"><p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Top escuchados</p><HorizontalRank rows={computed.topListenedReleases.map((row) => ({ name: `${row.artist} - ${row.title}`, value: row.value }))} /></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"><p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Géneros guardados</p><HorizontalRank rows={computed.savedGenres} /></div>
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"><p className="mb-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Estilos guardados</p><HorizontalRank rows={computed.savedStyles} /></div>
                </div>
              </div>
            </div>
          </MiniFold>
        </div>
      </Fold>

      <Fold kicker="Users" title="Usuarios" hint="Directorio operativo de usuarios con búsqueda y ficha resumida para soporte o seguimiento." value={`${computed.usersDirectory.length} usuarios`}>
        <div className="grid gap-4 2xl:grid-cols-[0.82fr_1.18fr]">
          <MiniFold title="Buscador de usuarios" caption="Busca por nombre, email o id y selecciona una cuenta para ver su ficha." defaultOpen>
            <div className="space-y-4">
              <input
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Buscar usuario por nombre, email o id..."
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
              />
              <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${selectedUser?.id === user.id ? "border-cyan-300/30 bg-cyan-300/12" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{user.full_name || user.email || user.id}</p>
                        <p className="truncate text-xs text-zinc-400">{user.email || user.id}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {user.is_admin ? <SectionChip tone="rose" icon="A" label="Admin" /> : null}
                        {user.bypass_subscription ? <SectionChip tone="amber" icon="B" label="Bypass" /> : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                      <span>Searches {user.searchCount}</span>
                      <span>Favoritos {user.favoriteCount}</span>
                      <span>Escuchados {user.listenedCount}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </MiniFold>

          <MiniFold title="Ficha de usuario" caption="Información relevante para entender su actividad, acceso y suscripción." defaultOpen>
            {selectedUser ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <HeroStat label="Usuario" value={selectedUser.full_name || "Sin nombre"} hint={selectedUser.email || selectedUser.id} accent="cyan" />
                  <HeroStat label="Suscripción" value={selectedUser.subscription?.status || "inactive"} hint={selectedUser.subscription?.stripe_subscription_id || "Sin subscription id"} accent={selectedUser.subscription?.status === "active" ? "emerald" : "amber"} />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <KpiStrip label="Registrado" value={formatDateTime(selectedUser.created_at)} delta="alta" tone="cyan" />
                  <KpiStrip label="Último seen" value={formatDateTime(selectedUser.last_seen_at)} delta="presencia" tone="blue" />
                  <KpiStrip label="Búsquedas" value={selectedUser.searchCount} delta={selectedUser.lastSearchAt ? `última ${formatDateTime(selectedUser.lastSearchAt)}` : "sin búsquedas"} tone="emerald" />
                  <KpiStrip label="Suscrito desde" value={formatDateTime(selectedUser.subscription?.created_at)} delta={selectedUser.subscription?.cancel_at_period_end ? "cancelación programada" : "vigente"} tone="amber" />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <AlertTile tone="blue" title="Favoritos" value={selectedUser.favoriteCount} detail="Releases guardados como favoritos por este usuario." />
                  <AlertTile tone="emerald" title="Escuchados" value={selectedUser.listenedCount} detail="Releases marcados como escuchados." />
                  <AlertTile tone={selectedUser.bypass_subscription ? "amber" : "rose"} title="Acceso" value={selectedUser.bypass_subscription ? "Bypass" : selectedUser.subscription?.status || "inactive"} detail={selectedUser.is_admin ? "Cuenta admin con visibilidad total." : "Estado principal de acceso a la app."} />
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 text-sm text-zinc-400">No hay usuarios que coincidan con el filtro.</div>
            )}
          </MiniFold>
        </div>
      </Fold>

      <Fold kicker="Ops" title="Operación y soporte" hint="Alertas de salud del producto, fricción del usuario y cosas que conviene vigilar." value="monitorización">
        <div className="mb-5 flex flex-wrap gap-2">
          <SectionChip tone="rose" icon="!" label="Incidencias" />
          <SectionChip tone="blue" icon="~" label="Monitor" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <HeroStat label="Search failed" value={computed.failedSearches} hint="Errores reportados por búsquedas guardadas" accent="rose" />
          <HeroStat label="Search aborted" value={computed.abortedSearches} hint="Búsquedas detenidas antes de completarse" accent="amber" />
          <HeroStat label="Customers sin sub" value={computed.customerWithoutSubscription} hint="Posibles incidencias de checkout o webhook" accent="rose" />
          <HeroStat label="Cancelan al final" value={computed.cancelAtPeriodEnd} hint="Usuarios con cancelación programada" accent="blue" />
        </div>
      </Fold>
    </div>
  );
}

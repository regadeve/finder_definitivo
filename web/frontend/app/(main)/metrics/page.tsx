"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MetricsDashboard from "./MetricsDashboard";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserProfile } from "@/lib/supabase/profile";
import { navigateWithTransition } from "@/lib/view-transition";

type OverviewMetrics = {
  totalRegisteredUsers: number;
  newUsersToday: number;
  newUsersLast7Days: number;
  newUsersLast30Days: number;
  activeUsersNow: number;
  activeUsersToday: number;
  activeUsersLast7Days: number;
};

type GrowthPoint = {
  day: string;
  registeredUsers: number;
  activeUsers: number;
};

function panel(extra = "") {
  return `rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl ${extra}`;
}

function readNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function normalizeOverview(payload: unknown): OverviewMetrics {
  const row = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | null;
  const safe = row ?? {};

  return {
    totalRegisteredUsers: readNumber(safe, ["total_registered_users", "total_users", "registered_users_total"]),
    newUsersToday: readNumber(safe, ["new_users_today", "users_created_today"]),
    newUsersLast7Days: readNumber(safe, ["new_users_last_7_days", "new_users_7d", "new_users_last7days"]),
    newUsersLast30Days: readNumber(safe, ["new_users_last_30_days", "new_users_30d", "new_users_last30days"]),
    activeUsersNow: readNumber(safe, ["active_users_now", "currently_connected_users", "active_now"]),
    activeUsersToday: readNumber(safe, ["active_users_today", "users_active_today"]),
    activeUsersLast7Days: readNumber(safe, ["active_users_last_7_days", "active_users_7d", "active_users_last7days"]),
  };
}

function normalizeGrowth(payload: unknown): GrowthPoint[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        day: readString(row, ["day", "date", "metric_day"]),
        registeredUsers: readNumber(row, ["registered_users", "new_registered_users", "new_users"]),
        activeUsers: readNumber(row, ["active_users", "daily_active_users", "users_active"]),
      };
    })
    .filter((item) => item.day);
}

export default function MetricsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<OverviewMetrics>({
    totalRegisteredUsers: 0,
    newUsersToday: 0,
    newUsersLast7Days: 0,
    newUsersLast30Days: 0,
    activeUsersNow: 0,
    activeUsersToday: 0,
    activeUsersLast7Days: 0,
  });
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;
      if (!user) {
        navigateWithTransition(router, "/", "replace");
        return;
      }

      try {
        const profile = await getCurrentUserProfile(supabase);
        if (!active) return;

        if (!profile?.is_admin) {
          navigateWithTransition(router, "/search", "replace");
          return;
        }

        const [overviewResult, growthResult] = await Promise.all([
          supabase.rpc("get_admin_metrics_overview"),
          supabase.rpc("get_admin_metrics_growth", { days: 30 }),
        ]);

        if (!active) return;

        if (overviewResult.error) {
          throw new Error(`No se pudo cargar get_admin_metrics_overview(): ${overviewResult.error.message}`);
        }

        if (growthResult.error) {
          throw new Error(`No se pudo cargar get_admin_metrics_growth(30): ${growthResult.error.message}`);
        }

        setOverview(normalizeOverview(overviewResult.data));
        setGrowth(normalizeGrowth(growthResult.data));
      } catch (nextError) {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "No se pudieron cargar las metricas.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  if (loading) {
    return <main className="min-h-screen bg-[#050816] p-8 text-zinc-200">Cargando metricas...</main>;
  }

  return (
    <main className="min-h-screen bg-[#050816] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-0 top-0 h-[420px] w-[420px] rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute right-0 top-24 h-[360px] w-[360px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 py-8 md:px-8 lg:px-10 lg:py-10">
        <section className="animate-fade-up-soft mb-8 overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,15,28,0.92),rgba(8,12,23,0.76))] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.45)] md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-300/80">Admin Metrics</p>
              <h1 className="mt-4 max-w-3xl font-[var(--font-display-serif)] text-5xl leading-none text-white md:text-7xl">
                Lectura directa del pulso de usuarios en Supabase.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 md:text-base">
                Este panel usa exclusivamente <code>profiles</code>, presencia por <code>last_seen_at</code> y las RPCs admin ya creadas en Supabase para mostrar crecimiento y actividad reciente.
              </p>
            </div>

            <div className={panel("p-5 md:p-6")}>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Accesos</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a href="/search" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]">Volver al Finder</a>
                <a href="/search" className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20">Ir a busqueda</a>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-400">
                Conectados ahora = usuarios con <code>last_seen_at</code> dentro de los ultimos 15 minutos.
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <section className={panel("p-6 text-sm text-rose-100")}>
            {error}
          </section>
        ) : (
          <MetricsDashboard overview={overview} growth={growth} />
        )}
      </div>
    </main>
  );
}

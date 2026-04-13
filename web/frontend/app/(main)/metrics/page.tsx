"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MetricsDashboard from "./MetricsDashboard";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserProfile } from "@/lib/supabase/profile";
import { fetchYearlessReleaseHits, type YearlessReleaseHit } from "@/lib/supabase/yearless-releases";
import { navigateWithTransition } from "@/lib/view-transition";

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
  return `rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl ${extra}`;
}

export default function MetricsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<ProfileMetricRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionMetricRow[]>([]);
  const [searches, setSearches] = useState<SearchMetricRow[]>([]);
  const [releases, setReleases] = useState<ReleaseMetricRow[]>([]);
  const [yearlessHits, setYearlessHits] = useState<YearlessReleaseHit[]>([]);
  const [billingInvoices, setBillingInvoices] = useState<BillingInvoiceRow[]>([]);
  const [billingEvents, setBillingEvents] = useState<BillingEventRow[]>([]);

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

        const [profilesResult, subscriptionsResult, searchesResult, releasesResult, yearlessResult, billingInvoicesResult, billingEventsResult] = await Promise.all([
          supabase.from("profiles").select("id, email, full_name, created_at, last_seen_at, is_admin, bypass_subscription").order("created_at", { ascending: false }).limit(5000),
          supabase.from("user_subscriptions").select("user_id, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, created_at, updated_at").order("updated_at", { ascending: false }).limit(5000),
          supabase.from("user_searches").select("id, user_id, status, result_count, created_at, filters").order("created_at", { ascending: false }).limit(5000),
          supabase.from("user_releases").select("user_id, release_uri, title, artist, is_favorite, listened, listened_at, genres, styles, formats, updated_at").order("updated_at", { ascending: false }).limit(5000),
          fetchYearlessReleaseHits(supabase, 250),
          supabase.from("billing_invoices").select("stripe_invoice_id, user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, livemode, currency, amount_due, amount_paid, amount_remaining, subtotal, tax, total, period_start, period_end, paid_at, created_at, updated_at").order("created_at", { ascending: false }).limit(5000),
          supabase.from("billing_events").select("stripe_event_id, event_type, livemode, user_id, stripe_customer_id, stripe_subscription_id, stripe_invoice_id, created_at, received_at").order("created_at", { ascending: false }).limit(5000),
        ]);

        if (!active) return;

        if (profilesResult.error) throw new Error(`No se pudo cargar profiles: ${profilesResult.error.message}`);
        if (subscriptionsResult.error) throw new Error(`No se pudo cargar user_subscriptions: ${subscriptionsResult.error.message}`);
        if (searchesResult.error) throw new Error(`No se pudo cargar user_searches: ${searchesResult.error.message}`);
        if (releasesResult.error) throw new Error(`No se pudo cargar user_releases: ${releasesResult.error.message}`);
        if (billingInvoicesResult.error) throw new Error(`No se pudo cargar billing_invoices: ${billingInvoicesResult.error.message}`);
        if (billingEventsResult.error) throw new Error(`No se pudo cargar billing_events: ${billingEventsResult.error.message}`);

        setProfiles((profilesResult.data ?? []) as ProfileMetricRow[]);
        setSubscriptions((subscriptionsResult.data ?? []) as SubscriptionMetricRow[]);
        setSearches((searchesResult.data ?? []) as SearchMetricRow[]);
        setReleases((releasesResult.data ?? []) as ReleaseMetricRow[]);
        setYearlessHits(yearlessResult);
        setBillingInvoices((billingInvoicesResult.data ?? []) as BillingInvoiceRow[]);
        setBillingEvents((billingEventsResult.data ?? []) as BillingEventRow[]);
      } catch (nextError) {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "No se pudieron cargar las metricas.");
      } finally {
        if (active) setLoading(false);
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

      <div className="relative w-full px-4 py-8 md:px-6 lg:px-8 lg:py-10 xl:px-10 2xl:px-12">
        <section className="animate-fade-up-soft mb-8 overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,15,28,0.92),rgba(8,12,23,0.76))] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.45)] md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-300/80">Admin Metrics</p>
              <h1 className="mt-4 max-w-3xl font-[var(--font-display-serif)] text-5xl leading-none text-white md:text-7xl">
                Panel maestro de negocio, uso y catálogo.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 md:text-base">
                El panel resume crecimiento, suscripciones, búsquedas, calidad del catálogo y señales operativas. Todo viene de Supabase y se presenta en bloques desplegables para mantener la vista limpia.
              </p>
            </div>

            <div className={panel("p-5 md:p-6")}>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Accesos</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a href="/search" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]">Volver al Finder</a>
                <a href="/settings" className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20">Perfil y ajustes</a>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-400">Si alguna sección falla, revisa las nuevas políticas admin y la migración de releases sin año en Supabase.</p>
            </div>
          </div>
        </section>

        {error ? (
          <section className={panel("p-6 text-sm text-rose-100")}>{error}</section>
        ) : (
          <MetricsDashboard
            profiles={profiles}
            subscriptions={subscriptions}
            searches={searches}
            releases={releases}
            yearlessHits={yearlessHits}
            billingInvoices={billingInvoices}
            billingEvents={billingEvents}
          />
        )}
      </div>
    </main>
  );
}

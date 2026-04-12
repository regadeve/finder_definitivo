"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchUserAccessStatus, type UserAccessStatus } from "@/lib/supabase/access";
import { createCheckoutSession, createPortalSession } from "@/lib/billing/api";
import { navigateWithTransition } from "@/lib/view-transition";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("es-ES");
}

function BillingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState<UserAccessStatus | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (active) router.replace("/");
        return;
      }

      try {
        const nextAccess = await fetchUserAccessStatus(supabase, session.user.id);
        if (!active) return;
        setAccess(nextAccess);

        if (searchParams.get("checkout") === "success") {
          setMessage("Pago recibido. Si Stripe ya confirmo la suscripcion, en unos segundos tendras acceso.");
        } else if (searchParams.get("checkout") === "cancelled") {
          setMessage("La suscripcion se cancelo antes de completar el pago.");
        } else if (nextAccess.canUseApp) {
          setMessage("Tu acceso esta listo.");
        }
      } catch (error) {
        if (active) {
          setMessage("No se pudo comprobar tu acceso.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [router, searchParams, supabase]);

  async function onSubscribe() {
    setBusy(true);
    try {
      const { url } = await createCheckoutSession(supabase, "/billing");
      window.location.href = url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar el pago.");
      setBusy(false);
    }
  }

  async function onPortal() {
    setBusy(true);
    try {
      const { url } = await createPortalSession(supabase, "/billing");
      window.location.href = url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir el portal de Stripe.");
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#050816] px-6 text-zinc-400">Comprobando suscripcion...</main>;
  }

  const subscriptionLabel = access?.hasActiveSubscription
    ? access.subscriptionStatus === "trialing"
      ? "Prueba activa"
      : "Suscripcion activa"
    : access?.bypassSubscription || access?.isAdmin
      ? "Acceso manual"
      : "Suscripcion requerida";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.14),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(244,63,94,0.08),_transparent_28%),#050816] px-6 py-10 md:px-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <section className="rounded-[34px] border border-white/10 bg-black/40 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-xl md:p-6">
          <div className="rounded-[30px] border border-white/10 bg-[rgba(7,12,24,0.92)] p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-cyan-300/80">Suscripcion</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">Acceso a 103 FINDER</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">La app requiere una suscripcion mensual de 10 EUR, salvo cuentas con acceso manual para admin o testers.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Estado</p>
                <p className="mt-1 text-lg font-semibold text-white">{subscriptionLabel}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Plan</p>
                <p className="mt-2 text-xl font-semibold text-white">10 EUR/mes</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Renovacion</p>
                <p className="mt-2 text-xl font-semibold text-white">{formatDate(access?.currentPeriodEnd ?? null)}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Acceso extra</p>
                <p className="mt-2 text-xl font-semibold text-white">{access?.bypassSubscription || access?.isAdmin ? "Si" : "No"}</p>
              </div>
            </div>

            {message ? (
              <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">{message}</div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              {access?.canUseApp ? (
                <button
                  type="button"
                  onClick={() => navigateWithTransition(router, "/search")}
                  className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
                >
                  Entrar a la app
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onSubscribe()}
                disabled={busy}
                className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-semibold text-black transition hover:brightness-95 disabled:opacity-50"
              >
                {busy ? "Abriendo Stripe..." : "Suscribirme por 10 EUR/mes"}
              </button>
              <button
                type="button"
                onClick={() => void onPortal()}
                disabled={busy || !access?.stripeCustomerId}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                Gestionar suscripcion
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20"
              >
                Cerrar sesion
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#050816] px-6 text-zinc-400">Comprobando suscripcion...</main>}>
      <BillingPageContent />
    </Suspense>
  );
}

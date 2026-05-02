"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAppLanguage } from "@/components/app-language-provider";
import { fetchUserAccessStatus } from "@/lib/supabase/access";
import { getBillingApiAvailability } from "@/lib/billing/api";
import { appRoutes, normalizeAppPath } from "@/lib/routes";
import { navigateWithTransition } from "@/lib/view-transition";

type AuthMode = "login" | "signup";

type Notice = {
  kind: "error" | "success";
  text: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function toAuthNotice(message: string, invalidCredentialsMessage: string) {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("invalid login credentials") || normalized.includes("invalid credentials")) {
    return invalidCredentialsMessage;
  }

  return message;
}

function AuthShellContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { t } = useAppLanguage();
  const redirectTo = normalizeAppPath(searchParams.get("redirectTo") || appRoutes.search);

  const [mode, setMode] = useState<AuthMode>("login");
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  async function resolveDestination(userId: string) {
    const access = await fetchUserAccessStatus(supabase, userId);
    return access.canUseApp ? redirectTo : appRoutes.billing;
  }

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      setHasSession(Boolean(data.session));
      setCheckingSession(false);
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  async function createProfile(userId: string, nextEmail: string, fullName: string) {
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      email: nextEmail,
      full_name: fullName || null,
    });

    if (error) {
      console.warn("No se pudo sincronizar el perfil en profiles:", error.message);
    }
  }

  async function onLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    const normalizedEmail = normalizeEmail(email);
    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    setLoading(false);

    if (error) {
      setNotice({ kind: "error", text: toAuthNotice(error.message, t("auth.invalidCredentials")) });
      return;
    }

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    const nextPath = userId ? await resolveDestination(userId) : appRoutes.billing;

    setNotice({ kind: "success", text: t("auth.loggedIn") });
    navigateWithTransition(router, nextPath, "replace");
  }

  async function onSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    const normalizedEmail = normalizeEmail(email);
    const cleanedName = name.trim();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: cleanedName,
        },
      },
    });

    if (error) {
      setLoading(false);
      setNotice({ kind: "error", text: error.message });
      return;
    }

    if (data.user && data.session) {
      await createProfile(data.user.id, normalizedEmail, cleanedName);
      const billingApi = await getBillingApiAvailability();
      setLoading(false);

      if (!billingApi.ok) {
        setNotice({
          kind: "success",
            text: t("auth.billingUnavailable", { baseUrl: billingApi.baseUrl }),
        });
        setMode("login");
        setPassword("");
        return;
      }

      setNotice({ kind: "success", text: t("auth.accountCreated") });
      navigateWithTransition(router, appRoutes.billing, "replace");
      return;
    }

    setLoading(false);
    setPassword("");
    setNotice({
      kind: "success",
      text: t("auth.accountCreatedEmail"),
    });
    setMode("login");
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-sm text-[var(--muted)] shadow-[var(--shadow)] backdrop-blur">
          {t("auth.prepare")}
        </div>
      </main>
    );
  }

  const isLogin = mode === "login";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.14),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(217,70,239,0.08),_transparent_32%),#050816] px-6 py-8 md:px-10 lg:px-16">
      <div className="mx-auto max-w-xl">
        <section className="rounded-[34px] border border-white/10 bg-black/40 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-xl md:p-6">
          <div className="rounded-[30px] border border-white/10 bg-[rgba(7,12,24,0.92)] p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-cyan-300/80">{t("auth.access")}</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">{isLogin ? t("auth.login") : t("auth.signup")}</h1>
              </div>

              <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setNotice(null);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${isLogin ? "bg-cyan-400 text-black" : "text-zinc-400"}`}
                >
                  {t("auth.enter")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setNotice(null);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${!isLogin ? "bg-white text-black" : "text-zinc-400"}`}
                >
                  {t("auth.createUser")}
                </button>
              </div>
            </div>

            {hasSession && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                <span>{t("auth.sessionReady")}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const { data } = await supabase.auth.getSession();
                      const userId = data.session?.user.id;
                      const nextPath = userId ? await resolveDestination(userId) : appRoutes.billing;
                      navigateWithTransition(router, nextPath);
                    }}
                    className="rounded-full bg-cyan-400 px-4 py-2 font-medium text-black"
                  >
                    {t("auth.goApp")}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setHasSession(false);
                       setNotice({ kind: "success", text: t("auth.sessionClosed") });
                    }}
                    className="rounded-full border border-emerald-300/30 px-4 py-2 font-medium text-emerald-100"
                  >
                    {t("auth.logout")}
                  </button>
                </div>
              </div>
            )}

            <form className="mt-8 space-y-5" onSubmit={isLogin ? onLogin : onSignup}>
              {!isLogin && (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-200">{t("auth.name")}</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-[#0d1320] px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/70"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    type="text"
                    autoComplete="name"
                    placeholder={t("auth.namePlaceholder")}
                    required={!isLogin}
                  />
                </label>
              )}

              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-200">{t("auth.email")}</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#0d1320] px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/70"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@correo.com"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-200">{t("auth.password")}</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#0d1320] px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/70"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  placeholder={isLogin ? t("auth.passwordPlaceholderLogin") : t("auth.passwordPlaceholderSignup")}
                  minLength={6}
                  required
                />
              </label>

              {notice && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                    notice.kind === "error"
                      ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
                      : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                  }`}
                >
                  {notice.text}
                </div>
              )}

              <button
                className={`w-full rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isLogin ? "bg-cyan-400 text-black" : "bg-white text-black"
                }`}
                disabled={loading}
                type="submit"
              >
                {loading ? (isLogin ? t("auth.loadingLogin") : t("auth.loadingSignup")) : isLogin ? t("auth.submitLogin") : t("auth.submitSignup")}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function AuthShell() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center px-6 py-10 text-sm text-[var(--muted)]">Loading...</main>}>
      <AuthShellContent />
    </Suspense>
  );
}

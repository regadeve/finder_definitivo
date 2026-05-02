"use client";

import Link from "next/link";
import { appRoutes } from "@/lib/routes";
import { useAppLanguage } from "@/components/app-language-provider";

const downloadUrl = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL?.trim() || "/downloads/103-Finder-Windows-x64-Setup.exe";

export default function HomePage() {
  const { t } = useAppLanguage();

  const pillars = [
    { title: t("home.pillarSearch"), text: t("home.pillarSearchText") },
    { title: t("home.pillarLibrary"), text: t("home.pillarLibraryText") },
    { title: t("home.pillarDesktop"), text: t("home.pillarDesktopText") },
  ];

  const highlights = [t("home.highlight1"), t("home.highlight2"), t("home.highlight3"), t("home.highlight4")];

  return (
    <main className="min-h-screen overflow-hidden bg-[#07111f] text-white">
      <section className="relative isolate border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_26%),radial-gradient(circle_at_78%_18%,_rgba(34,197,94,0.16),_transparent_24%),linear-gradient(145deg,#09111d_0%,#071a2a_48%,#04111b_100%)] px-6 py-8 md:px-10 lg:px-16 lg:py-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.34em] text-amber-200/70">103 FINDER</p>
              <p className="mt-2 max-w-md text-sm text-slate-300">{t("home.projectTag")}</p>
            </div>
            <nav className="flex flex-wrap items-center gap-3 text-sm text-slate-200">
              <a href="#proyecto" className="rounded-full border border-white/10 px-4 py-2 transition hover:border-amber-300/40 hover:bg-white/5">{t("home.project")}</a>
              <a href="#descarga" className="rounded-full border border-white/10 px-4 py-2 transition hover:border-emerald-300/40 hover:bg-white/5">{t("home.download")}</a>
              <Link href={appRoutes.login} className="rounded-full border border-amber-200/70 bg-amber-50 px-5 py-2.5 font-semibold text-slate-950 shadow-[0_10px_30px_rgba(251,191,36,0.18)] transition hover:bg-amber-100 hover:shadow-[0_14px_34px_rgba(251,191,36,0.24)]">
                {t("home.access")}
              </Link>
            </nav>
          </header>

          <div className="grid gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:py-20">
            <div className="animate-fade-up-soft">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-amber-100/90">
                {t("home.workflow")}
              </div>
              <h1 className="mt-6 max-w-4xl font-[var(--font-display-serif)] text-5xl leading-none tracking-[-0.04em] text-white md:text-7xl">
                {t("home.headline")}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                {t("home.description")}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={downloadUrl}
                  download
                  className="rounded-full border border-emerald-200/60 bg-emerald-300 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_14px_36px_rgba(16,185,129,0.24)] transition hover:bg-emerald-200 hover:shadow-[0_18px_40px_rgba(16,185,129,0.3)]"
                >
                  {t("home.downloadWindows")}
                </a>
                <Link
                  href={appRoutes.login}
                  className="rounded-full border border-cyan-200/35 bg-cyan-50/95 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_34px_rgba(34,211,238,0.16)] transition hover:bg-white hover:shadow-[0_16px_38px_rgba(34,211,238,0.22)]"
                >
                  {t("home.loginOrSignup")}
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap gap-6 text-sm text-slate-300">
                <span>Desktop app</span>
                <span>Supabase Auth</span>
                <span>Stripe mensual</span>
                <span>Discogs workflow</span>
              </div>
            </div>

            <div className="animate-fade-up-soft rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-4 shadow-[0_40px_120px_rgba(0,0,0,0.4)] [animation-delay:120ms]">
              <div className="rounded-[26px] border border-white/10 bg-[#09101a]/95 p-6">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-slate-400">
                  <span>{t("home.overview")}</span>
                  <span>v0.1</span>
                </div>
                <div className="mt-6 grid gap-3">
                  {highlights.map((item) => (
                    <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-200">
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-4 text-sm leading-6 text-emerald-50">
                  {t("home.downloadHint")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="proyecto" className="px-6 py-16 md:px-10 lg:px-16 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">{t("home.project")}</p>
            <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
              {t("home.projectTitle")}
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-300">
              {t("home.projectText")}
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {pillars.map((item, index) => (
              <article
                key={item.title}
                className="animate-fade-up-soft rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 [animation-delay:220ms]"
                style={{ animationDelay: `${220 + index * 90}ms` }}
              >
                <p className="text-xs uppercase tracking-[0.28em] text-amber-200/75">0{index + 1}</p>
                <h3 className="mt-4 text-2xl font-semibold text-white">{item.title}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-300">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="descarga" className="px-6 pb-18 md:px-10 lg:px-16 lg:pb-24">
        <div className="mx-auto max-w-6xl rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),transparent_28%),linear-gradient(160deg,#08131f_0%,#0b1b29_46%,#09111a_100%)] p-5 shadow-[0_36px_110px_rgba(0,0,0,0.38)] md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-200/75">{t("home.download")}</p>
              <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
                {t("home.downloadTitle")}
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                {t("home.downloadText")}
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/25 p-6 backdrop-blur">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                <span>{t("home.recommendedVersion")}</span>
                <span className="rounded-full bg-emerald-300/18 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Windows</span>
              </div>
              <a
                href={downloadUrl}
                download
                className="mt-5 flex w-full items-center justify-center rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-slate-950 transition hover:brightness-95"
              >
                  {t("home.downloadInstaller")}
                </a>
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  {t("home.downloadHint")}
                </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { appRoutes } from "@/lib/routes";

const downloadUrl = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL?.trim() || "/downloads/103-Finder-Windows-x64-Setup.exe";

const signalPoints = [
  "Desktop-first workflow",
  "Powered by Discogs ecosystem data",
  "Advanced filtering logic",
  "Built for serious users",
];

const personas = [
  {
    title: "Collectors",
    text: "Track catalog detail with more structure, stronger filtering and less friction between sessions.",
  },
  {
    title: "Diggers",
    text: "Go beyond conventional digging with a sharper workflow for deep catalog exploration.",
  },
  {
    title: "Selectors / DJs",
    text: "Find stronger material with less noise, more intent and more repeatable search logic.",
  },
  {
    title: "Sellers / Power users",
    text: "Work through large volumes of catalog data with better control, context and search depth.",
  },
];

const benefits = [
  {
    title: "Sharper filtering",
    text: "Work with year, country, style, format, sale and catalog logic in a more deliberate way.",
  },
  {
    title: "Persistent context",
    text: "Keep favorites, listened releases and search history inside the same desktop workflow.",
  },
  {
    title: "Local token control",
    text: "Your Discogs token stays local on your machine, where the sensitive layer belongs.",
  },
  {
    title: "Focused desktop experience",
    text: "Move beyond scattered tabs and work inside a more intentional search environment.",
  },
];

const modes = [
  {
    title: "Discogs Live",
    text: "Run live search directly through the desktop workflow using your local token.",
  },
  {
    title: "Catalog Local",
    text: "Use a local catalog database when available for a faster, more private structured workflow.",
  },
  {
    title: "Catalog Hybrid",
    text: "Combine structured catalog filtering with live data refresh for the most advanced mode.",
  },
];

const onboardingSteps = [
  "Create your account or sign in.",
  "Download the Windows desktop app.",
  "Store your Discogs token locally.",
  "Choose your search mode and run your first session.",
  "Save favorites, listened releases and build your own context.",
];

const faqs = [
  {
    question: "Do I need a Discogs account?",
    answer: "Yes. 103 Finder is designed for people who already work with Discogs ecosystem data and want a better workflow around it.",
  },
  {
    question: "Where is my token stored?",
    answer: "Inside the desktop app, your Discogs token is stored locally on your machine rather than on a public web server.",
  },
  {
    question: "Does it work without a local catalog database?",
    answer: "Yes. The workflow can fall back to the remote catalog layer when no local DSN is configured.",
  },
  {
    question: "Is there a web version for the core search workflow?",
    answer: "The core premium workflow is desktop-first. The web presence is there to explain the product, manage access and support downloads.",
  },
];

function panelClass(extra = "") {
  return `rounded-[28px] border border-white/10 bg-[rgba(14,21,35,0.86)] shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl ${extra}`;
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(255,191,79,0.14),transparent_23%),radial-gradient(circle_at_82%_14%,rgba(61,215,234,0.14),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(164,140,255,0.1),transparent_30%),linear-gradient(160deg,#030610_0%,#08101b_48%,#050915_100%)] text-white">
      <div className="mx-auto w-[min(1180px,calc(100%-36px))] px-0">
        <header className="flex flex-wrap items-center justify-between gap-4 py-7">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-amber-300/85">103 FINDER</p>
            <p className="mt-2 text-sm text-slate-300">Desktop-first discovery workflow for serious catalog users.</p>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-sm text-slate-100">
            <a href="#about" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10">About</a>
            <a href="#how-it-works" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10">How it works</a>
            <a href="#download" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10">Download</a>
            <Link href={appRoutes.login} className="rounded-full border border-cyan-300/40 bg-cyan-50/95 px-5 py-2.5 font-semibold text-slate-950 shadow-[0_12px_34px_rgba(34,211,238,0.16)] transition hover:bg-white">
              Access
            </Link>
          </nav>
        </header>

        <section className="grid gap-9 py-6 pb-16 lg:grid-cols-[1.12fr_0.88fr] lg:items-end">
          <div>
            <div className="inline-flex items-center rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-amber-100/90">
              Better than conventional digging
            </div>
            <h1 className="mt-6 max-w-4xl font-[var(--font-display-serif)] text-5xl leading-none tracking-[-0.045em] text-white md:text-7xl">
              A better way to dig.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              103 Finder is a desktop-first discovery workflow for serious collectors, diggers and selectors.
              Built around Discogs ecosystem data, refined for precision, control and depth.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={downloadUrl}
                download
                className="rounded-2xl border border-emerald-200/60 bg-emerald-300 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_14px_36px_rgba(16,185,129,0.24)] transition hover:bg-emerald-200"
              >
                Download for Windows
              </a>
              <a href="#how-it-works" className="rounded-2xl border border-white/12 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                See how it works
              </a>
            </div>

            <div className="mt-7 flex flex-wrap gap-3 text-sm text-slate-200">
              {signalPoints.map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className={panelClass("p-5")}>
            <div className="rounded-[24px] border border-white/10 bg-[#08111f]/95 p-6">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-400">
                <span>Desktop discovery workflow</span>
                <span>Current build</span>
              </div>
              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-7 text-slate-200">
                  Advanced search modes designed for deep catalog exploration.
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-7 text-slate-200">
                  Local token control, persistent context and a workflow built for repeat sessions.
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-7 text-slate-200">
                  A premium desktop environment for people who go beyond conventional digging.
                </div>
              </div>
              <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-4 text-sm leading-6 text-emerald-50">
                The desktop app keeps the workflow focused, controlled and built for serious catalog sessions.
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="py-8">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">What it is</p>
            <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
              A precision discovery tool for people who work deeply with catalog data.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-300">
              103 Finder turns search into a more structured workflow: faster, cleaner, more deliberate and more useful across repeated sessions.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <article className={panelClass("p-6")}>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-200/75">01</p>
              <h3 className="mt-4 text-2xl font-semibold text-white">Why it was built</h3>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Conventional digging can be slow, fragmented and repetitive. 103 Finder gives advanced users a more focused way to explore and filter.
              </p>
            </article>
            <article className={panelClass("p-6")}>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-200/75">02</p>
              <h3 className="mt-4 text-2xl font-semibold text-white">What it improves</h3>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Better filtering, stronger context, cleaner workflow and more control over the way a search session unfolds.
              </p>
            </article>
            <article className={panelClass("p-6")}>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-200/75">03</p>
              <h3 className="mt-4 text-2xl font-semibold text-white">Why it matters</h3>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                It is built for users who need discovery to feel intentional, not improvised.
              </p>
            </article>
          </div>
        </section>

        <section className="py-8">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">Built for</p>
            <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
              Serious users with serious intent.
            </h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {personas.map((item) => (
              <article key={item.title} className={panelClass("p-6")}>
                <h3 className="text-2xl font-semibold text-white">{item.title}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-300">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${panelClass("p-6 md:p-8")} my-8`}>
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">What you get</p>
            <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
              Precision, context and control.
            </h2>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="grid gap-4">
              {benefits.map((benefit, index) => (
                <article key={benefit.title} className="grid grid-cols-[54px_1fr] gap-4 rounded-[24px] border border-white/8 bg-white/[0.04] p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-bold text-cyan-100">0{index + 1}</span>
                  <div>
                    <h3 className="text-xl font-semibold text-white">{benefit.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{benefit.text}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="flex items-center rounded-[28px] border border-violet-300/15 bg-[radial-gradient(circle_at_top,_rgba(164,140,255,0.16),_transparent_24%),rgba(10,16,28,0.88)] p-8">
              <p className="font-[var(--font-display-serif)] text-2xl leading-10 text-white md:text-3xl">
                Built on top of Discogs ecosystem data, 103 Finder is designed for people who want a more deliberate way to search music catalogs.
              </p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-8">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">How it works</p>
            <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
              From setup to real search in minutes.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-5">
            {onboardingSteps.map((step, index) => (
              <article key={step} className={panelClass("min-h-[180px] p-5")}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-bold text-cyan-100">0{index + 1}</span>
                <p className="mt-5 text-sm leading-7 text-slate-200">{step}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-8">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">Onboarding</p>
            <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
              What onboarding looks like.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-300">
              The first session is designed to get you from setup to a meaningful search quickly, without unnecessary friction.
            </p>
          </div>
          <div className={`${panelClass("mt-8 grid gap-6 p-6 lg:grid-cols-[1.05fr_0.95fr]")}`}>
            <div>
              <h3 className="text-2xl font-semibold text-white">Your first minutes inside 103 Finder</h3>
              <ul className="mt-4 list-disc pl-5 text-sm leading-9 text-slate-200">
                <li>Sign in and access the desktop app.</li>
                <li>Store your Discogs token locally.</li>
                <li>Pick the search mode that fits your workflow.</li>
                <li>Run your first session and save context as you go.</li>
              </ul>
            </div>
            <div className="rounded-[26px] border border-emerald-300/20 bg-emerald-300/10 p-6">
              <strong className="block text-xl text-emerald-50">No complicated setup.</strong>
              <p className="mt-3 text-sm leading-7 text-emerald-100/90">Just a cleaner path into deep catalog exploration.</p>
              <a href="#download" className="mt-4 inline-flex text-sm font-semibold text-white underline underline-offset-4">Go to download section</a>
            </div>
          </div>
        </section>

        <section className="py-8">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">Three ways to work</p>
            <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
              Choose the mode that fits your session.
            </h2>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {modes.map((mode) => (
              <article key={mode.title} className={panelClass("p-6")}>
                <h3 className="text-2xl font-semibold text-white">{mode.title}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-300">{mode.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${panelClass("my-8 p-8")} bg-[radial-gradient(circle_at_top_right,rgba(61,215,234,0.16),transparent_25%),linear-gradient(160deg,rgba(7,12,22,0.92)_0%,rgba(9,18,31,0.96)_100%)]`}>
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">Built for control</p>
            <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
              The most sensitive layer stays on your machine.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-300">
              103 Finder uses a desktop-first model designed for trust, ownership and precision. Your Discogs token remains local, where it belongs.
            </p>
          </div>
        </section>

        <section id="download" className={`${panelClass("mb-10 p-6 md:p-8")} bg-[radial-gradient(circle_at_top,rgba(61,215,234,0.16),transparent_25%),linear-gradient(160deg,rgba(8,16,28,0.92)_0%,rgba(9,20,35,0.96)_100%)]`}>
          <div className="grid gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-200/75">Download</p>
              <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
                Install the app and enter the desktop workflow.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
                The first page inside the desktop app now mirrors the same positioning and onboarding logic as the public landing.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-black/25 p-6 backdrop-blur">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                <span>Recommended version</span>
                <span className="rounded-full bg-emerald-300/18 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Windows</span>
              </div>
              <a
                href={downloadUrl}
                download
                className="mt-5 flex w-full items-center justify-center rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-slate-950 transition hover:brightness-95"
              >
                Download installer
              </a>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                Download the installer or sign in to continue directly into the app.
              </p>
            </div>
          </div>
        </section>

        <section className="py-6">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">Questions</p>
            <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
              Common things serious users ask first.
            </h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {faqs.map((faq) => (
              <article key={faq.question} className={panelClass("p-6")}>
                <h3 className="text-xl font-semibold text-white">{faq.question}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-300">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="my-10 rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,191,79,0.12),transparent_22%),radial-gradient(circle_at_top_right,rgba(61,215,234,0.12),transparent_22%),rgba(10,18,31,0.92)] px-6 py-10 text-center">
          <p className="text-[11px] uppercase tracking-[0.32em] text-amber-200/75">Final step</p>
          <h2 className="mt-4 font-[var(--font-display-serif)] text-4xl tracking-[-0.03em] text-white md:text-5xl">
            Go beyond conventional digging.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-300">
            103 Finder gives serious users a more precise way to work with catalog data.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={downloadUrl} download className="rounded-2xl border border-emerald-200/60 bg-emerald-300 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_14px_36px_rgba(16,185,129,0.24)] transition hover:bg-emerald-200">
              Download for Windows
            </a>
            <Link href={appRoutes.login} className="rounded-2xl border border-white/12 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

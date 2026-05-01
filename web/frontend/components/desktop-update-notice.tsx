"use client";

import { useEffect, useState } from "react";
import { checkAppUpdate, installAppUpdate, type AppUpdateState } from "@/lib/desktop/updater";
import { toErrorMessage } from "@/lib/desktop/errors";

type BannerState = {
  checking: boolean;
  installing: boolean;
  update: AppUpdateState | null;
  error: string;
};

export function DesktopUpdateNotice() {
  const [state, setState] = useState<BannerState>({
    checking: true,
    installing: false,
    update: null,
    error: "",
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const update = await checkAppUpdate();
        if (!active) return;
        setDismissed(false);
        setState({
          checking: false,
          installing: false,
          update,
          error: "",
        });
      } catch (error) {
        if (!active) return;
        setState({
          checking: false,
          installing: false,
          update: null,
          error: toErrorMessage(error, "No se pudo comprobar si hay actualizaciones."),
        });
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleInstall() {
    setState((prev) => ({ ...prev, installing: true, error: "" }));
    try {
      await installAppUpdate();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        installing: false,
        error: toErrorMessage(error, "No se pudo instalar la actualizacion."),
      }));
    }
  }

  if (state.checking || !state.update?.available) {
    return null;
  }

  const isRequired = state.update.required;

  if (!isRequired && dismissed) {
    return null;
  }

  if (!isRequired) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[140] flex justify-center px-4">
        <div className="pointer-events-auto w-full max-w-2xl rounded-[28px] border border-emerald-300/20 bg-[linear-gradient(180deg,rgba(8,19,31,0.97),rgba(6,14,24,0.97))] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/80">Actualizacion disponible</p>
              <h3 className="mt-2 text-xl font-semibold text-white">103 Finder {state.update.version} ya esta lista</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Puedes seguir usando la app y actualizar cuando quieras desde aqui o desde Perfil.
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                Instalada {state.update.currentVersion} · Detectada {state.update.version ?? "-"}
              </p>
              {state.update.notes ? (
                <p className="mt-3 text-sm leading-6 text-zinc-400">{state.update.notes}</p>
              ) : null}
              {state.update.diagnostic ? (
                <p className="mt-3 text-sm leading-6 text-emerald-100">{state.update.diagnostic}</p>
              ) : null}
              {state.error ? (
                <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-200">
                  {state.error}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleInstall()}
                disabled={state.installing}
                className="rounded-2xl bg-[linear-gradient(135deg,#34d399,#22c55e)] px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:opacity-60"
              >
                {state.installing ? "Preparando..." : "Instalar"}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                disabled={state.installing}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.1] disabled:opacity-60"
              >
                Recordar luego
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#020611]/88 px-6 py-10 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-[34px] border border-emerald-300/20 bg-[linear-gradient(180deg,rgba(8,19,31,0.98),rgba(6,14,24,0.98))] p-7 text-white shadow-[0_40px_140px_rgba(0,0,0,0.55)]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/80">{isRequired ? "Actualizacion obligatoria" : "Actualizacion disponible"}</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">Instala 103 Finder {state.update.version}</h3>
          <p className="mt-3 text-sm leading-7 text-zinc-300">
            {isRequired
              ? "Hay una nueva version publicada y esta app no puede seguir usandose hasta instalarla. En Windows se cerrara para completar la actualizacion."
              : "Hay una nueva version lista para instalar. En Windows la app se cerrara para completar la actualizacion."}
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
            Instalada {state.update.currentVersion} · Detectada {state.update.version ?? "-"} · Minimo {state.update.minimumVersion ?? "-"}
          </p>
        </div>

        {state.update.notes ? (
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm leading-7 text-zinc-300">
            {state.update.notes}
          </div>
        ) : null}

        {state.update.diagnostic ? (
          <div className="mt-5 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-4 text-sm leading-6 text-emerald-100">
            {state.update.diagnostic}
          </div>
        ) : null}

        {state.error ? (
          <div className="mt-5 rounded-3xl border border-rose-400/20 bg-rose-400/10 px-5 py-4 text-sm leading-6 text-rose-200">
            {state.error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={state.installing}
            className="rounded-2xl bg-[linear-gradient(135deg,#34d399,#22c55e)] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:opacity-60"
          >
            {state.installing ? "Preparando actualizacion..." : isRequired ? "Actualizar ahora" : "Instalar actualizacion"}
          </button>
        </div>
      </div>
    </div>
  );
}

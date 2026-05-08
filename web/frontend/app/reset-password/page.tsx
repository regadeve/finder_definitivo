"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { appRoutes } from "@/lib/routes";

type Notice = {
  kind: "error" | "success";
  text: string;
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (password.length < 6) {
      setNotice({ kind: "error", text: "La contrasena debe tener al menos 6 caracteres." });
      return;
    }

    if (password !== confirmPassword) {
      setNotice({ kind: "error", text: "Las contrasenas no coinciden." });
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setNotice({ kind: "error", text: error.message });
      return;
    }

    setNotice({ kind: "success", text: "Contrasena actualizada. Redirigiendo al login..." });
    setTimeout(() => {
      router.replace(appRoutes.login);
    }, 1200);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.14),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(217,70,239,0.08),_transparent_32%),#050816] px-6 py-8 md:px-10 lg:px-16">
      <div className="mx-auto max-w-xl">
        <section className="rounded-[34px] border border-white/10 bg-black/40 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-xl md:p-6">
          <div className="rounded-[30px] border border-white/10 bg-[rgba(7,12,24,0.92)] p-6 md:p-8">
            <p className="text-[11px] uppercase tracking-[0.26em] text-cyan-300/80">Seguridad</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Restablecer contrasena</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Escribe tu nueva contrasena para completar la recuperacion de tu cuenta.</p>

            <form className="mt-8 space-y-5" onSubmit={onSubmit}>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-200">Nueva contrasena</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#0d1320] px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/70"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-200">Confirmar contrasena</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#0d1320] px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/70"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>

              {notice ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${notice.kind === "error" ? "border-rose-400/20 bg-rose-400/10 text-rose-100" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"}`}>
                  {notice.text}
                </div>
              ) : null}

              <button
                className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? "Guardando..." : "Guardar nueva contrasena"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

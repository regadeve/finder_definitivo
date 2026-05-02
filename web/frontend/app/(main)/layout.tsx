"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppLanguage } from "@/components/app-language-provider";
import { fetchUserAccessStatus } from "@/lib/supabase/access";
import { ensureDeviceAccess, transferDeviceAccess, type DeviceAccessState } from "@/lib/supabase/device-access";
import { appRoutes } from "@/lib/routes";
import { navigateWithTransition } from "@/lib/view-transition";
import Image from "next/image";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { t } = useAppLanguage();
  
  const [avatar, setAvatar] = useState<string | null>(null);
  const [initials, setInitials] = useState("?");
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deviceAccess, setDeviceAccess] = useState<DeviceAccessState | null>(null);
  const [movingDevice, setMovingDevice] = useState(false);
  const [deviceError, setDeviceError] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session) {
          router.replace("/");
          return;
        }

        const access = await fetchUserAccessStatus(supabase, session.user.id);
        if (!active) return;

        setIsAdmin(access.isAdmin);

        if (!access.canUseApp) {
          navigateWithTransition(router, appRoutes.billing, "replace");
          return;
        }

        const deviceState = await ensureDeviceAccess(supabase);
        if (!active) return;

        setDeviceAccess(deviceState.status === "authorized" ? null : deviceState);

        setCheckingAccess(false);
      } catch {
        if (active) {
          router.replace(appRoutes.billing);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function moveAccessToThisDevice() {
    setMovingDevice(true);
    setDeviceError("");

    try {
      const next = await transferDeviceAccess(supabase);
      if (next.status === "authorized") {
        setDeviceAccess(null);
        return;
      }

      setDeviceAccess(next);
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : t("deviceAccess.transferError"));
    } finally {
      setMovingDevice(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !active) return;
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url, full_name, email")
        .eq("id", session.user.id)
        .maybeSingle();
         
      if (!active) return;

      setAvatar(profile?.avatar_url ?? null);

      const name = profile?.full_name || profile?.email || session.user.email || "?";
      setInitials(name.substring(0, 2).toUpperCase());
    }
    
    const reloadProfile = () => {
      void loadProfile();
    };

    void loadProfile();
    window.addEventListener("profile-updated", reloadProfile);
    return () => {
      active = false;
      window.removeEventListener("profile-updated", reloadProfile);
    };
  }, [supabase]);

  const navItems: Array<{ label: string; href: string; icon: string }> = [
    { label: t("nav.finder"), href: appRoutes.search, icon: "🔍" },
    { label: t("nav.favorites"), href: appRoutes.favorites, icon: "⭐" },
    { label: t("nav.listened"), href: appRoutes.listened, icon: "🎧" },
    { label: t("nav.profile"), href: appRoutes.settings, icon: "👤" },
  ];

  if (isAdmin) {
    navItems.splice(3, 0, { label: t("nav.metrics"), href: appRoutes.metrics, icon: "📊" });
  }

  if (checkingAccess) {
    return <div className="flex h-screen w-full items-center justify-center bg-[#050816] text-zinc-400">{t("common.checkingAccess")}</div>;
  }

  if (deviceAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] px-6 py-10 text-zinc-100">
        <section className="w-full max-w-2xl rounded-[32px] border border-white/10 bg-black/40 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-xl md:p-8">
          <div className="rounded-[28px] border border-white/10 bg-[rgba(7,12,24,0.92)] p-6 md:p-8">
            <p className="text-[11px] uppercase tracking-[0.26em] text-cyan-300/80">{t("deviceAccess.badge")}</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              {deviceAccess.status === "transfer_available" ? t("deviceAccess.transferTitle") : t("deviceAccess.blockedTitle")}
            </h1>
            <p className="mt-4 text-sm leading-7 text-zinc-400">
              {deviceAccess.status === "transfer_available" ? t("deviceAccess.transferText") : t("deviceAccess.blockedText")}
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
                <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("deviceAccess.activeDevice")}</span>
                <span className="mt-1 block font-semibold text-white">{deviceAccess.activeDeviceName ?? "-"}</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
                <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("deviceAccess.limit")}</span>
                <span className="mt-1 block font-semibold text-white">
                  {deviceAccess.isAdmin
                    ? t("deviceAccess.adminExempt")
                    : `${deviceAccess.transfersUsed}/${deviceAccess.transfersLimit ?? 3}`}
                </span>
              </div>
            </div>

            {deviceAccess.status === "transfer_available" && !deviceAccess.isAdmin ? (
              <p className="mt-4 text-sm text-cyan-100">
                {t("deviceAccess.remaining", { count: deviceAccess.transfersRemaining ?? 0 })}
              </p>
            ) : null}

            {deviceAccess.status === "limit_reached" && deviceAccess.resetAt ? (
              <p className="mt-4 text-sm text-amber-100">
                {t("deviceAccess.resetAt", { date: new Date(deviceAccess.resetAt).toLocaleDateString() })}
              </p>
            ) : null}

            {deviceError ? (
              <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{deviceError}</div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              {deviceAccess.status === "transfer_available" ? (
                <button
                  type="button"
                  onClick={() => void moveAccessToThisDevice()}
                  disabled={movingDevice}
                  className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                >
                  {movingDevice ? t("deviceAccess.moving") : t("deviceAccess.moveHere")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigateWithTransition(router, appRoutes.home, "replace");
                }}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                {t("auth.logout")}
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#050816] text-zinc-100">
      {/* Nav Sidebar */}
      <nav className="flex w-[96px] shrink-0 flex-col items-center justify-between border-r border-white/10 bg-black/40 py-6 backdrop-blur-xl">
        <div className="flex flex-col items-center gap-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--neon-cyan),var(--neon-magenta))] font-serif font-bold text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            103
          </div>
          
          <div className="flex flex-col items-center gap-3">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navigateWithTransition(router, item.href)}
                  title={item.label}
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl transition-all ${
                    active 
                      ? "bg-cyan-400/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)] border border-cyan-400/30" 
                      : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                  }`}
                >
                  {item.icon}
                </button>
              );
            })}
          </div>
        </div>

        <button 
          type="button"
          onClick={() => navigateWithTransition(router, appRoutes.settings)}
          title="Perfil y Ajustes"
          className="group flex flex-col items-center gap-2 rounded-3xl border border-white/10 bg-white/5 px-2 py-3 transition hover:border-cyan-400/40 hover:bg-white/[0.08]"
        >
          <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-black/30 transition group-hover:ring-2 group-hover:ring-cyan-400/50">
            {avatar ? (
              <Image src={avatar} alt="Avatar" fill className="rounded-full object-cover" unoptimized />
            ) : (
              <span className="text-sm font-semibold text-zinc-400 group-hover:text-cyan-400">{initials}</span>
            )}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 group-hover:text-cyan-300">{t("nav.profile")}</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="relative flex min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

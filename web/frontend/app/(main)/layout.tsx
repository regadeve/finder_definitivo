"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchUserAccessStatus } from "@/lib/supabase/access";
import { navigateWithTransition } from "@/lib/view-transition";
import Image from "next/image";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  
  const [avatar, setAvatar] = useState<string | null>(null);
  const [initials, setInitials] = useState("?");
  const [checkingAccess, setCheckingAccess] = useState(true);

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

        if (!access.canUseApp) {
          navigateWithTransition(router, "/billing", "replace");
          return;
        }

        setCheckingAccess(false);
      } catch {
        if (active) {
          router.replace("/billing");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [router, supabase]);

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

  const navItems = [
    { label: "Finder", href: "/search", icon: "🔍" },
    { label: "Favoritos", href: "/favorites", icon: "⭐" },
    { label: "Escuchados", href: "/listened", icon: "🎧" },
    { label: "Métricas", href: "/metrics", icon: "📊" },
    { label: "Mi perfil", href: "/settings", icon: "👤" },
  ];

  if (checkingAccess) {
    return <div className="flex h-screen w-full items-center justify-center bg-[#050816] text-zinc-400">Comprobando acceso...</div>;
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
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl transition-all ${
                    active 
                      ? "bg-cyan-400/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)] border border-cyan-400/30" 
                      : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                  }`}
                >
                  {item.icon}
                </Link>
              );
            })}
          </div>
        </div>

        <Link 
          href="/settings" 
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
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 group-hover:text-cyan-300">Mi perfil</span>
        </Link>
      </nav>

      {/* Main Content Area */}
      <main className="relative flex min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import { deleteDiscogsToken, loadDiscogsToken, saveDiscogsToken } from "@/lib/desktop/discogs-token";
import { toErrorMessage } from "@/lib/desktop/errors";
import { isTauriRuntime } from "@/lib/desktop/runtime";
import { fetchAdminAccessUsers, fetchUserAccessStatus, setUserBypassAccess, type AdminAccessUser, type UserAccessStatus } from "@/lib/supabase/access";
import { createClient } from "@/lib/supabase/client";
import { deleteUserSearch, fetchUserSearches, type UserSearchRow } from "@/lib/supabase/user-searches";
import { navigateWithTransition } from "@/lib/view-transition";
import { useRouter } from "next/navigation";

function panel(extra = "") {
  return `rounded-[28px] border border-white/10 bg-black/40 shadow-xl backdrop-blur-xl ${extra}`;
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  
  const [isDesktop, setIsDesktop] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Token State
  const [savingToken, setSavingToken] = useState(false);
  const [token, setToken] = useState("");
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [tokenNotice, setTokenNotice] = useState<{kind: "error"|"success"|"info", text: string} | null>(null);

  // Profile State
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{full_name: string, email: string, avatar_url: string|null}>({
    full_name: "", email: "", avatar_url: null
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{kind: "error"|"success", text: string} | null>(null);
  const [searches, setSearches] = useState<UserSearchRow[]>([]);
  const [searchesError, setSearchesError] = useState("");
  const [accessStatus, setAccessStatus] = useState<UserAccessStatus | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminAccessUser[]>([]);
  const [adminAccessError, setAdminAccessError] = useState("");
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function formatDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("es-ES");
  }

  function searchBadge(label: string, value: string) {
    return (
      <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
        {label} {value}
      </span>
    );
  }

  function statusLabel(value: UserSearchRow["status"]) {
    if (value === "completed") return "Completada";
    if (value === "aborted") return "Detenida";
    if (value === "failed") return "Error";
    return "En curso";
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      // 1. Check Auth & Profile
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (active) router.replace("/");
        return;
      }
      
      if (active) setUserId(session.user.id);
      
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, email, avatar_url")
        .eq("id", session.user.id)
        .maybeSingle();
         
      if (active) {
        setProfile({
          full_name: profileData?.full_name ?? "",
          email: profileData?.email ?? session.user.email ?? "",
          avatar_url: profileData?.avatar_url ?? null,
        });

        try {
          const status = await fetchUserAccessStatus(supabase, session.user.id);
          if (active) {
            setAccessStatus(status);
          }

          if (status.isAdmin && active) {
            const users = await fetchAdminAccessUsers(supabase);
            if (active) {
              setAdminUsers(users);
              setAdminAccessError("");
            }
          }
        } catch {
          if (active) {
            setAdminAccessError("No se pudo cargar el estado de acceso.");
          }
        }

        try {
          const rows = await fetchUserSearches(supabase, session.user.id);
          if (active) {
            setSearches(rows);
            setSearchesError("");
          }
        } catch (error) {
          if (active) {
            setSearchesError("No se pudo cargar tu historial de busquedas. Revisa la migracion de user_searches en Supabase.");
          }
        }
      }

      // 2. Check Desktop Token
      const desktop = await isTauriRuntime();
      if (!active) return;
      setIsDesktop(desktop);

      if (!desktop) {
        setTokenNotice({ kind: "info", text: "Modo Web: Las llamadas a Discogs pasarán por tu IP pública sin proxy local." });
      } else {
        try {
          const state = await loadDiscogsToken();
          if (active) {
            setToken(state.token);
            setHasStoredToken(state.hasToken);
          }
        } catch (error) {}
      }
      
      if (active) setLoading(false);
    })();

    return () => { active = false; };
  }, [supabase, router]);

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    setSavingProfile(true);
    setProfileNotice(null);

    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/avatar_${Date.now()}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert({ id: userId, email: profile.email, full_name: profile.full_name, avatar_url: publicUrl }, { onConflict: "id" });
        
      if (updateError) throw updateError;

      setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
      setProfileNotice({ kind: "success", text: "Imagen de perfil actualizada correctamente." });
      window.dispatchEvent(new Event("profile-updated"));
    } catch (error) {
      setProfileNotice({ kind: "error", text: "Error al subir la imagen. Asegúrate de ejecutar la migración SQL de avatares." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function onSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;

    setSavingProfile(true);
    setProfileNotice(null);

    try {
      const payload = {
        id: userId,
        full_name: profile.full_name.trim(),
        email: profile.email,
      };

      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
      if (error) throw error;

      setProfile((prev) => ({ ...prev, full_name: payload.full_name }));
      setProfileNotice({ kind: "success", text: "Perfil actualizado correctamente." });
      window.dispatchEvent(new Event("profile-updated"));
    } catch (error) {
      setProfileNotice({ kind: "error", text: "No se pudo guardar tu nombre de usuario." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function onSaveToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTokenNotice(null);

    if (!isDesktop) {
      setTokenNotice({ kind: "info", text: "El token local solo funciona en Desktop." });
      return;
    }

    setSavingToken(true);
    try {
      await saveDiscogsToken(token);
      setHasStoredToken(token.trim().length > 0);
      setTokenNotice({ kind: "success", text: "Token guardado en el llavero seguro." });
    } catch (error) {
      setTokenNotice({ kind: "error", text: toErrorMessage(error, "Fallo al guardar.") });
    } finally {
      setSavingToken(false);
    }
  }

  async function onDeleteToken() {
    setTokenNotice(null);
    if (!isDesktop) return;

    setSavingToken(true);
    try {
      await deleteDiscogsToken();
      setToken("");
      setHasStoredToken(false);
      setTokenNotice({ kind: "success", text: "Token eliminado del sistema." });
    } catch (error) {
      setTokenNotice({ kind: "error", text: toErrorMessage(error, "Error al borrar.") });
    } finally {
      setSavingToken(false);
    }
  }
  
  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  function reuseSearch(search: UserSearchRow) {
    const params = new URLSearchParams({
      savedFilters: JSON.stringify(search.filters),
    });
    navigateWithTransition(router, `/search?${params.toString()}`);
  }

  async function removeSearch(searchId: number) {
    try {
      await deleteUserSearch(supabase, searchId);
      setSearches((prev) => prev.filter((item) => item.id !== searchId));
      setSearchesError("");
    } catch {
      setSearchesError("No se pudo borrar la busqueda guardada.");
    }
  }

  async function toggleBypass(user: AdminAccessUser) {
    setTogglingUserId(user.id);
    try {
      await setUserBypassAccess(supabase, user.id, !user.bypass_subscription, user.is_admin);
      setAdminUsers((prev) => prev.map((item) => item.id === user.id ? { ...item, bypass_subscription: !item.bypass_subscription } : item));
      setAdminAccessError("");
      if (user.id === userId) {
        setAccessStatus((prev) => prev ? { ...prev, bypassSubscription: !user.bypass_subscription, canUseApp: prev.hasActiveSubscription || !user.bypass_subscription || prev.isAdmin } : prev);
      }
    } catch {
      setAdminAccessError("No se pudo actualizar el acceso manual.");
    } finally {
      setTogglingUserId(null);
    }
  }

  function accessLabel() {
    if (!accessStatus) return "Cargando";
    if (accessStatus.isAdmin) return "Admin";
    if (accessStatus.bypassSubscription) return "Tester / bypass";
    if (accessStatus.hasActiveSubscription) return accessStatus.subscriptionStatus === "trialing" ? "Prueba activa" : "Suscripcion activa";
    return "Suscripcion requerida";
  }

  if (loading) return <div className="p-10 text-zinc-400">Cargando perfil...</div>;

  return (
    <div className="filters-scrollbar min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.1),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(217,70,239,0.05),_transparent_40%)] p-8 md:p-12">
      <div className="mx-auto max-w-7xl space-y-8">
        
        <div>
           <h1 className="text-4xl font-serif font-bold text-white mb-2">Mi perfil</h1>
           <p className="text-zinc-400 text-sm">Gestiona tu foto, tu nombre de usuario y tu API key de Discogs.</p>
        </div>

        <section className={panel("p-6")}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">Acceso a la app</h2>
              <p className="mt-2 text-sm text-zinc-400">La entrada depende de tu suscripcion Stripe o de un acceso manual para admin y testers.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Estado actual</p>
              <p className="mt-1 text-lg font-semibold text-white">{accessLabel()}</p>
            </div>
          </div>
        </section>

        {/* PROFILE SECTION */}
        <section className={panel("p-8")}>
          <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
            
            <div className="flex flex-col items-center gap-4">
               <div className="relative w-32 h-32 rounded-full ring-2 ring-white/10 overflow-hidden bg-black/40 group">
                 {profile.avatar_url ? (
                   <Image src={profile.avatar_url} alt="Avatar" fill className="object-cover" unoptimized/>
                 ) : (
                   <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-600">
                     {profile.email?.substring(0, 2).toUpperCase() || "?"}
                   </div>
                 )}
                 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                   <span className="text-white text-xs font-semibold tracking-wider">CAMBIAR</span>
                 </div>
                 <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" />
               </div>
               {savingProfile && <p className="text-xs text-cyan-400 animate-pulse">Subiendo...</p>}
            </div>

             <div className="flex-1 space-y-2">
                <h2 className="text-2xl font-bold text-white">{profile.full_name || profile.email || "Tu perfil"}</h2>
                <p className="text-zinc-400 text-sm mb-4">{profile.email}</p>
                
                {profileNotice && (
                   <p className={`text-sm px-4 py-2 rounded-xl mb-4 ${profileNotice.kind === 'error' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                     {profileNotice.text}
                   </p>
                )}

                <form onSubmit={onSaveProfile} className="mb-5 space-y-4 max-w-xl">
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Nombre de usuario</span>
                    <input
                      value={profile.full_name}
                      onChange={(event) => setProfile((prev) => ({ ...prev, full_name: event.target.value }))}
                      type="text"
                      placeholder="Tu nombre visible"
                      className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Email</span>
                    <input
                      value={profile.email}
                      type="email"
                      disabled
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-400 outline-none"
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={savingProfile} className="rounded-xl bg-[linear-gradient(135deg,#06b6d4,#2563eb)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-[0_10px_30px_rgba(6,182,212,0.25)] transition hover:brightness-110 disabled:opacity-50">
                      {savingProfile ? "Guardando..." : "Guardar perfil"}
                    </button>
                    <button onClick={logout} type="button" className="rounded-xl px-5 py-2 text-xs font-bold tracking-wide text-rose-300 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 transition-all">
                      CERRAR SESION
                    </button>
                  </div>
                </form>
                
             </div>

          </div>
        </section>

        {/* DISCOGS TOKEN SECTION */}
         <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr] xl:items-start">
         <section className={panel("p-8 h-full")}>
            <h2 className="text-xl font-bold text-white mb-2">API key de Discogs</h2>
            <p className="text-zinc-400 text-sm mb-6">Puedes cambiar tu token personal cuando quieras para usar otra clave de Discogs.</p>
           
           <form onSubmit={onSaveToken} className="space-y-4 max-w-lg">
             <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Discogs API key / token</span>
               <input
                 value={token}
                 onChange={(e) => setToken(e.target.value)}
                 type="password"
                 placeholder="Ej: XXXXXXXXXXXX"
                 className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50 transition"
               />
             </label>

             {tokenNotice && (
                <div className={`rounded-xl px-4 py-3 text-sm border ${tokenNotice.kind === "error" ? "border-rose-400/20 bg-rose-400/10 text-rose-200" : tokenNotice.kind === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"}`}>
                  {tokenNotice.text}
                </div>
             )}

             <div className="flex gap-3 pt-2">
               <button type="submit" disabled={!isDesktop || savingToken} className="rounded-xl bg-[linear-gradient(135deg,#06b6d4,#2563eb)] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(6,182,212,0.3)] hover:brightness-110 disabled:opacity-50 transition flex-1">
                  {savingToken ? "Guardando..." : "Guardar token"}
               </button>
               <button type="button" onClick={onDeleteToken} disabled={!isDesktop || savingToken || !hasStoredToken} className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50 transition">
                 Borrar
               </button>
             </div>
             </form>
          </section>

         <section className={panel("p-8 h-full")}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Busquedas guardadas</h2>
               <p className="text-zinc-400 text-sm">Cada busqueda queda asociada a tu usuario con sus filtros y resultados.</p>
             </div>
             <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
               <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Historial</p>
               <p className="mt-1 text-2xl font-semibold text-white">{searches.length}</p>
             </div>
           </div>

           {searchesError ? (
             <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
               {searchesError}
             </div>
           ) : null}

           <div className="mt-6 space-y-4">
             {searches.map((search) => {
               const filters = search.filters;
               const yearLabel = filters.sin_anyo ? "Sin ano" : `${filters.year_start}-${filters.year_end}`;
               const priceLabel = filters.precio_maximo > 0 ? `${filters.precio_minimo}€-${filters.precio_maximo}€` : `${filters.precio_minimo}€+`;
               const stylesLabel = filters.styles.length ? filters.styles.join(", ") : "Sin estilo";
               const genresLabel = filters.genres.length ? filters.genres.join(", ") : "Sin genero";

               return (
                 <article key={search.id} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                   <div className="flex flex-wrap items-start justify-between gap-4">
                     <div className="min-w-0 flex-1">
                       <h3 className="text-base font-semibold text-white">{search.summary}</h3>
                       <p className="mt-1 text-sm text-zinc-400">{formatDateTime(search.created_at)}</p>
                     </div>
                     <div className="flex flex-wrap gap-2">
                       {searchBadge("Estado", statusLabel(search.status))}
                       {searchBadge("Resultados", String(search.result_count))}
                       {searchBadge("YouTube", filters.youtube_status)}
                     </div>
                   </div>

                   <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                     <div className="rounded-2xl border border-white/8 bg-[#0b111c] px-4 py-3 text-xs leading-6 text-zinc-400"><span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">Generos</span><span className="mt-1 block text-zinc-300">{genresLabel}</span></div>
                     <div className="rounded-2xl border border-white/8 bg-[#0b111c] px-4 py-3 text-xs leading-6 text-zinc-400"><span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">Estilos</span><span className="mt-1 block text-zinc-300">{stylesLabel}</span></div>
                     <div className="rounded-2xl border border-white/8 bg-[#0b111c] px-4 py-3 text-xs leading-6 text-zinc-400"><span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">Ano</span><span className="mt-1 block text-zinc-300">{yearLabel}</span></div>
                     <div className="rounded-2xl border border-white/8 bg-[#0b111c] px-4 py-3 text-xs leading-6 text-zinc-400"><span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">Precio</span><span className="mt-1 block text-zinc-300">{priceLabel}</span></div>
                   </div>

                   <div className="mt-4 flex flex-wrap gap-2">
                     <button
                       type="button"
                       onClick={() => reuseSearch(search)}
                       className="rounded-2xl border border-cyan-300/30 bg-cyan-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/30"
                     >
                       Reutilizar busqueda
                     </button>
                     <button
                       type="button"
                       onClick={() => void removeSearch(search.id)}
                       className="rounded-2xl border border-rose-300/30 bg-rose-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-100 transition hover:bg-rose-300/30"
                     >
                       Borrar busqueda
                     </button>
                   </div>
                 </article>
               );
             })}

             {!searches.length && !searchesError ? (
               <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 text-center">
                 <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">Sin busquedas</p>
                 <p className="mt-3 text-lg font-semibold text-white">Todavia no has guardado ninguna busqueda.</p>
                 <p className="mt-2 text-sm text-zinc-400">Cuando uses el buscador, los filtros quedaran registrados aqui para tu usuario.</p>
               </div>
             ) : null}
            </div>
          </section>
         </div>

         {accessStatus?.isAdmin ? (
           <section className={panel("p-8")}>
             <div className="flex items-center justify-between gap-4">
               <div>
                 <h2 className="text-xl font-bold text-white mb-2">Acceso manual para testers</h2>
                 <p className="text-zinc-400 text-sm">Activa o desactiva el bypass de suscripcion para usuarios concretos.</p>
               </div>
               <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
                 <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Usuarios</p>
                 <p className="mt-1 text-2xl font-semibold text-white">{adminUsers.length}</p>
               </div>
             </div>

             {adminAccessError ? (
               <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{adminAccessError}</div>
             ) : null}

             <div className="mt-6 space-y-3">
               {adminUsers.map((user) => (
                 <article key={user.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                   <div>
                     <h3 className="text-sm font-semibold text-white">{user.full_name || user.email}</h3>
                     <p className="mt-1 text-xs text-zinc-500">{user.email}</p>
                   </div>
                   <div className="flex flex-wrap items-center gap-2">
                     {user.is_admin ? searchBadge("Rol", "Admin") : null}
                     {user.bypass_subscription ? searchBadge("Bypass", "Si") : searchBadge("Bypass", "No")}
                     <button
                       type="button"
                       onClick={() => void toggleBypass(user)}
                       disabled={togglingUserId === user.id || user.is_admin}
                       className="rounded-2xl border border-cyan-300/30 bg-cyan-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/30 disabled:opacity-50"
                     >
                       {user.is_admin ? "Admin fijo" : togglingUserId === user.id ? "Guardando..." : user.bypass_subscription ? "Quitar bypass" : "Dar bypass"}
                     </button>
                   </div>
                 </article>
               ))}
             </div>
           </section>
         ) : null}

        </div>
      </div>
  );
}

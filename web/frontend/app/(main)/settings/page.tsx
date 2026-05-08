"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import { deleteCatalogDsn, loadCatalogDsn, saveCatalogDsn } from "@/lib/desktop/catalog-config";
import { deleteDiscogsToken, loadDiscogsToken, saveDiscogsToken } from "@/lib/desktop/discogs-token";
import { toErrorMessage } from "@/lib/desktop/errors";
import { isTauriRuntime } from "@/lib/desktop/runtime";
import { checkAppUpdate, installAppUpdate, type AppUpdateState } from "@/lib/desktop/updater";
import { fetchAdminAccessUsers, fetchUserAccessStatus, setUserBypassAccess, type AdminAccessUser, type UserAccessStatus } from "@/lib/supabase/access";
import { setUserDeviceTransferBonus } from "@/lib/supabase/access";
import { createClient } from "@/lib/supabase/client";
import { appRoutes } from "@/lib/routes";
import { deleteUserSearch, fetchUserSearches, type UserSearchRow } from "@/lib/supabase/user-searches";
import { createPortalSession } from "@/lib/billing/api";
import { getUserDeviceAccessSummary, type DeviceAccessSummary } from "@/lib/supabase/device-access";
import { navigateWithTransition } from "@/lib/view-transition";
import { useRouter } from "next/navigation";
import { useAppLanguage } from "@/components/app-language-provider";

function panel(extra = "") {
  return `rounded-[28px] border border-white/10 bg-black/40 shadow-xl backdrop-blur-xl ${extra}`;
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { language, setLanguage, languageNames, supportedLanguages, t } = useAppLanguage();
  
  const [isDesktop, setIsDesktop] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Token State
  const [savingToken, setSavingToken] = useState(false);
  const [token, setToken] = useState("");
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [tokenNotice, setTokenNotice] = useState<{kind: "error"|"success"|"info", text: string} | null>(null);
  const [catalogDsn, setCatalogDsn] = useState("");
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [hasCatalogDsn, setHasCatalogDsn] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState<{kind: "error"|"success"|"info", text: string} | null>(null);

  // Profile State
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{full_name: string, email: string, avatar_url: string|null}>({
    full_name: "", email: "", avatar_url: null
  });
  const [preferredLanguage, setPreferredLanguage] = useState(language);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{kind: "error"|"success", text: string} | null>(null);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    next: "",
    confirm: "",
  });
  const [openingPortal, setOpeningPortal] = useState(false);
  const [searches, setSearches] = useState<UserSearchRow[]>([]);
  const [searchesError, setSearchesError] = useState("");
  const [accessStatus, setAccessStatus] = useState<UserAccessStatus | null>(null);
  const [deviceSummary, setDeviceSummary] = useState<DeviceAccessSummary | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminAccessUser[]>([]);
  const [adminDeviceSummaries, setAdminDeviceSummaries] = useState<Record<string, DeviceAccessSummary>>({});
  const [adminAccessError, setAdminAccessError] = useState("");
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [updatingBonusUserId, setUpdatingBonusUserId] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const catalogApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
    if (value === "completed") return t("settings.completed");
    if (value === "aborted") return t("settings.stopped");
    if (value === "failed") return t("settings.error");
    return t("settings.running");
  }

  function updateHeadline(state: AppUpdateState) {
    if (!state.available) {
      return t("settings.noPendingUpdates");
    }

    return state.required ? t("settings.requiredUpdate") : t("settings.optionalUpdate");
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      // 1. Check Auth & Profile
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (active) router.replace(appRoutes.home);
        return;
      }
      
      if (active) setUserId(session.user.id);
      
      const { data: profileData } = await supabase
        .from("profiles")
          .select("full_name, email, avatar_url, preferred_language")
        .eq("id", session.user.id)
        .maybeSingle();
         
      if (active) {
        setProfile({
          full_name: profileData?.full_name ?? "",
          email: profileData?.email ?? session.user.email ?? "",
          avatar_url: profileData?.avatar_url ?? null,
        });
        setPreferredLanguage((profileData?.preferred_language as typeof language | undefined) ?? language);

        try {
          const status = await fetchUserAccessStatus(supabase, session.user.id);
          const summary = await getUserDeviceAccessSummary(supabase);
          if (active) {
            setAccessStatus(status);
            setDeviceSummary(summary);
          }

          if (status.isAdmin && active) {
            const users = await fetchAdminAccessUsers(supabase);
            if (active) {
              setAdminUsers(users);
              const summaryEntries = await Promise.all(
                users.map(async (user) => [user.id, await getUserDeviceAccessSummary(supabase, user.id)] as const)
              );
              setAdminDeviceSummaries(Object.fromEntries(summaryEntries));
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
          const state = await loadDiscogsToken(session.user.id);
          if (active) {
            setToken(state.token);
            setHasStoredToken(state.hasToken);
          }
        } catch (error) {}

        try {
          const dsn = await loadCatalogDsn();
          if (active) {
            setCatalogDsn(dsn);
            setHasCatalogDsn(dsn.trim().length > 0);
          }
        } catch (error) {}
      }
      
      if (active) setLoading(false);
    })();

    return () => { active = false; };
  }, [supabase, router]);

  useEffect(() => {
    setPreferredLanguage(language);
  }, [language]);

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

  async function onSaveLanguage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;

    setSavingLanguage(true);
    setProfileNotice(null);

    try {
      setLanguage(preferredLanguage);

      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId, email: profile.email, full_name: profile.full_name.trim(), preferred_language: preferredLanguage }, { onConflict: "id" });

      if (error) throw error;

      setProfileNotice({ kind: "success", text: t("settings.languageSaved") });
      window.dispatchEvent(new Event("profile-updated"));
    } catch {
      setProfileNotice({ kind: "error", text: t("settings.languageError") });
    } finally {
      setSavingLanguage(false);
    }
  }

  async function onOpenSubscriptionPortal() {
    if (!accessStatus?.stripeCustomerId) {
      setProfileNotice({ kind: "error", text: t("settings.noStripeCustomer") });
      return;
    }

    setOpeningPortal(true);
    setProfileNotice(null);

    try {
      const { url } = await createPortalSession(supabase, appRoutes.billing);
      window.location.href = url;
    } catch (error) {
      setProfileNotice({ kind: "error", text: error instanceof Error ? error.message : t("settings.portalError") });
      setOpeningPortal(false);
    }
  }

  async function onChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileNotice(null);

    if (passwordForm.next.length < 6) {
      setProfileNotice({ kind: "error", text: "La contrasena debe tener al menos 6 caracteres." });
      return;
    }

    if (passwordForm.next !== passwordForm.confirm) {
      setProfileNotice({ kind: "error", text: "Las contrasenas no coinciden." });
      return;
    }

    setSavingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.next });
      if (error) throw error;
      setPasswordForm({ next: "", confirm: "" });
      setProfileNotice({ kind: "success", text: "Contrasena actualizada correctamente." });
    } catch (error) {
      setProfileNotice({ kind: "error", text: error instanceof Error ? error.message : "No se pudo actualizar la contrasena." });
    } finally {
      setSavingPassword(false);
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
      if (!userId) {
        throw new Error("No se pudo identificar al usuario actual.");
      }
      await saveDiscogsToken(userId, token);
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
      if (!userId) {
        throw new Error("No se pudo identificar al usuario actual.");
      }
      await deleteDiscogsToken(userId);
      setToken("");
      setHasStoredToken(false);
      setTokenNotice({ kind: "success", text: "Token eliminado del sistema." });
    } catch (error) {
      setTokenNotice({ kind: "error", text: toErrorMessage(error, "Error al borrar.") });
    } finally {
      setSavingToken(false);
    }
  }

  async function onSaveCatalog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCatalogNotice(null);

    if (!isDesktop) {
      setCatalogNotice({ kind: "info", text: "La conexion local del catalogo solo funciona en Desktop." });
      return;
    }

    setSavingCatalog(true);
    try {
      await saveCatalogDsn(catalogDsn);
      setHasCatalogDsn(catalogDsn.trim().length > 0);
      setCatalogNotice({ kind: "success", text: "Conexion local del catalogo guardada en el llavero seguro." });
    } catch (error) {
      setCatalogNotice({ kind: "error", text: toErrorMessage(error, "No se pudo guardar la conexion local del catalogo.") });
    } finally {
      setSavingCatalog(false);
    }
  }

  async function onDeleteCatalog() {
    setCatalogNotice(null);
    if (!isDesktop) return;

    setSavingCatalog(true);
    try {
      await deleteCatalogDsn();
      setCatalogDsn("");
      setHasCatalogDsn(false);
      setCatalogNotice({ kind: "success", text: "Conexion local del catalogo eliminada del sistema." });
    } catch (error) {
      setCatalogNotice({ kind: "error", text: toErrorMessage(error, "No se pudo borrar la conexion local del catalogo.") });
    } finally {
      setSavingCatalog(false);
    }
  }
  
  async function logout() {
    await supabase.auth.signOut();
    router.replace(appRoutes.home);
  }

  function reuseSearch(search: UserSearchRow) {
    const params = new URLSearchParams({
      savedFilters: JSON.stringify(search.filters),
    });
    navigateWithTransition(router, `${appRoutes.search}?${params.toString()}`);
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

  async function adjustDeviceBonus(user: AdminAccessUser, delta: number) {
    const nextBonus = Math.max(0, user.device_transfer_bonus + delta);
    setUpdatingBonusUserId(user.id);

    try {
      await setUserDeviceTransferBonus(supabase, user.id, nextBonus);
      setAdminUsers((prev) => prev.map((item) => item.id === user.id ? { ...item, device_transfer_bonus: nextBonus } : item));
      setAdminDeviceSummaries((prev) => ({
        ...prev,
        [user.id]: prev[user.id]
          ? {
              ...prev[user.id],
              bonus: nextBonus,
              transfersLimit: prev[user.id].isAdmin ? null : 3 + nextBonus,
              transfersRemaining: prev[user.id].isAdmin
                ? null
                : Math.max((3 + nextBonus) - prev[user.id].transfersUsed, 0),
            }
          : prev[user.id],
      }));
      setAdminAccessError("");
    } catch {
      setAdminAccessError(t("settings.deviceBonusError"));
    } finally {
      setUpdatingBonusUserId(null);
    }
  }

  function accessLabel() {
    if (!accessStatus) return t("settings.loading");
    if (accessStatus.isAdmin) return "Admin";
    if (accessStatus.bypassSubscription) return t("settings.testerBypass");
    if (accessStatus.hasActiveSubscription) return accessStatus.subscriptionStatus === "trialing" ? t("settings.activeTrial") : t("settings.activeSubscription");
    return t("settings.subscriptionRequired");
  }

  async function onCheckForUpdates() {
    setCheckingUpdate(true);
    setUpdateNotice(null);

    try {
      const update = await checkAppUpdate();
      setUpdateState(update);

      if (!update.configured) {
        setUpdateNotice({ kind: "info", text: update.message || "El actualizador no esta configurado en este build." });
      } else if (update.available) {
        setUpdateNotice({ kind: update.required ? "error" : "success", text: update.message || (update.required ? `Hay una actualizacion obligatoria disponible: ${update.version}.` : `Hay una nueva version disponible: ${update.version}.`) });
      } else {
        setUpdateNotice({ kind: "info", text: update.message || "Ya tienes la ultima version disponible." });
      }
    } catch (error) {
      setUpdateNotice({ kind: "error", text: toErrorMessage(error, "No se pudo comprobar si hay actualizaciones.") });
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function onInstallUpdate() {
    setInstallingUpdate(true);
    setUpdateNotice(null);

    try {
      await installAppUpdate();
      setUpdateNotice({ kind: "success", text: "La actualizacion se esta instalando. En Windows la app se cerrara para completarla." });
    } catch (error) {
      setUpdateNotice({ kind: "error", text: toErrorMessage(error, "No se pudo instalar la actualizacion.") });
    } finally {
      setInstallingUpdate(false);
    }
  }

  if (loading) return <div className="p-10 text-zinc-400">{t("settings.loadingProfile")}</div>;

  return (
    <div className="filters-scrollbar min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.1),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(217,70,239,0.05),_transparent_40%)] p-8 md:p-12">
      <div className="mx-auto max-w-7xl space-y-8">
        
        <div>
           <h1 className="text-4xl font-serif font-bold text-white mb-2">{t("settings.profile")}</h1>
           <p className="text-zinc-400 text-sm">{t("settings.subtitle")}</p>
        </div>

        <section className={panel("p-6")}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">{t("settings.appAccess")}</h2>
              <p className="mt-2 text-sm text-zinc-400">{t("settings.appAccessHint")}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.currentStatus")}</p>
              <p className="mt-1 text-lg font-semibold text-white">{accessLabel()}</p>
            </div>
          </div>
        </section>

        <section className={panel("p-6")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold text-white">{t("settings.desktopUpdates")}</h2>
              <p className="mt-2 text-sm text-zinc-400">{t("settings.desktopUpdatesHint")}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.currentVersion")}</p>
              <p className="mt-1 text-lg font-semibold text-white">{updateState?.currentVersion ?? "-"}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onCheckForUpdates()}
              disabled={!isDesktop || checkingUpdate || installingUpdate}
              className="rounded-2xl bg-[linear-gradient(135deg,#34d399,#10b981)] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:opacity-50"
            >
              {checkingUpdate ? t("settings.checkingUpdates") : t("settings.checkUpdates")}
            </button>
            <button
              type="button"
              onClick={() => void onInstallUpdate()}
              disabled={!isDesktop || installingUpdate || !updateState?.available}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              {installingUpdate ? t("settings.installingUpdate") : t("settings.installUpdate")}
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.installed")}</p>
              <p className="mt-2 text-lg font-semibold text-white">{updateState?.currentVersion ?? "-"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.detected")}</p>
              <p className="mt-2 text-lg font-semibold text-white">{updateState?.version ?? "-"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.minimumRequired")}</p>
              <p className="mt-2 text-lg font-semibold text-white">{updateState?.minimumVersion ?? "-"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.status")}</p>
              <p className="mt-2 text-lg font-semibold text-white">{updateState ? updateHeadline(updateState) : "-"}</p>
            </div>
          </div>

          {updateState?.available ? (
            <div className={`mt-5 rounded-2xl border px-4 py-4 text-sm ${updateState.required ? "border-rose-300/20 bg-rose-300/10 text-rose-50" : "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"}`}>
              <p className="font-semibold">{updateState.required ? t("settings.requiredUpdate") : t("settings.newVersionAvailable")}: {updateState.version}</p>
              <p className={`mt-2 leading-6 ${updateState.required ? "text-rose-50/90" : "text-emerald-50/90"}`}>
                {updateState.required
                  ? `Este build no deberia seguir usandose sin instalar la version ${updateState.version}.`
                  : `Puedes instalar la version ${updateState.version} cuando quieras desde esta pantalla.`}
              </p>
              {updateState.notes ? (
                <p className={`mt-2 leading-6 ${updateState.required ? "text-rose-50/90" : "text-emerald-50/90"}`}>{updateState.notes}</p>
              ) : null}
              {updateState.diagnostic ? (
                <p className={`mt-2 leading-6 ${updateState.required ? "text-rose-100" : "text-emerald-100"}`}>{updateState.diagnostic}</p>
              ) : null}
              {updateState.downloadUrl ? (
                <p className={`mt-2 break-all text-xs ${updateState.required ? "text-rose-100/80" : "text-emerald-100/80"}`}>Instalador detectado: {updateState.downloadUrl}</p>
              ) : null}
              {updateState.manifestUrl ? (
                <p className={`mt-1 break-all text-xs ${updateState.required ? "text-rose-100/80" : "text-emerald-100/80"}`}>Manifest: {updateState.manifestUrl}</p>
              ) : null}
            </div>
          ) : null}

          {updateNotice ? (
            <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${updateNotice.kind === "error" ? "border-rose-400/20 bg-rose-400/10 text-rose-200" : updateNotice.kind === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"}`}>
              {updateNotice.text}
            </div>
          ) : null}

          {!isDesktop ? (
            <p className="mt-4 text-sm text-zinc-500">{t("settings.integratedUpdatesDesktopOnly")}</p>
          ) : null}
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
                    <span className="text-white text-xs font-semibold tracking-wider">{t("settings.change")}</span>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" />
                </div>
                {savingProfile && <p className="text-xs text-cyan-400 animate-pulse">{t("settings.uploading")}</p>}
             </div>

              <div className="flex-1 space-y-2">
                 <h2 className="text-2xl font-bold text-white">{profile.full_name || profile.email || t("settings.profileFallback")}</h2>
                 <p className="text-zinc-400 text-sm mb-4">{profile.email}</p>
                
                {profileNotice && (
                   <p className={`text-sm px-4 py-2 rounded-xl mb-4 ${profileNotice.kind === 'error' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                     {profileNotice.text}
                   </p>
                )}

                <form onSubmit={onSaveProfile} className="mb-5 space-y-4 max-w-xl">
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("settings.username")}</span>
                    <input
                      value={profile.full_name}
                      onChange={(event) => setProfile((prev) => ({ ...prev, full_name: event.target.value }))}
                      type="text"
                      placeholder={t("settings.visibleName")}
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
                      {savingProfile ? t("settings.savingProfile") : t("settings.saveProfile")}
                    </button>
                    <button onClick={logout} type="button" className="rounded-xl px-5 py-2 text-xs font-bold tracking-wide text-rose-300 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 transition-all">
                      {t("auth.logout")}
                    </button>
                  </div>
                </form>

                <form onSubmit={onSaveLanguage} className="max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("settings.language")}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{t("settings.languageHint")}</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <select
                      value={preferredLanguage}
                      onChange={(event) => {
                        const nextLanguage = event.target.value as typeof language;
                        setPreferredLanguage(nextLanguage);
                        setLanguage(nextLanguage);
                      }}
                      className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
                    >
                      {supportedLanguages.map((option) => (
                        <option key={option} value={option}>
                          {languageNames[option]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" disabled={savingLanguage} className="rounded-xl bg-[linear-gradient(135deg,#06b6d4,#2563eb)] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-[0_10px_30px_rgba(6,182,212,0.25)] transition hover:brightness-110 disabled:opacity-50">
                      {savingLanguage ? t("settings.savingLanguage") : t("settings.language")}
                    </button>
                  </div>
                </form>

                <form onSubmit={onChangePassword} className="mt-5 max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Seguridad</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">Cambia tu contrasena de acceso de forma segura.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={passwordForm.next}
                      onChange={(event) => setPasswordForm((prev) => ({ ...prev, next: event.target.value }))}
                      type="password"
                      placeholder="Nueva contrasena"
                      minLength={6}
                      className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
                      required
                    />
                    <input
                      value={passwordForm.confirm}
                      onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirm: event.target.value }))}
                      type="password"
                      placeholder="Confirmar contrasena"
                      minLength={6}
                      className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
                      required
                    />
                  </div>
                  <button type="submit" disabled={savingPassword} className="mt-3 rounded-xl bg-[linear-gradient(135deg,#06b6d4,#2563eb)] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-[0_10px_30px_rgba(6,182,212,0.25)] transition hover:brightness-110 disabled:opacity-50">
                    {savingPassword ? "Guardando contrasena..." : "Actualizar contrasena"}
                  </button>
                </form>

                <section className="max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("settings.subscriptionPanel")}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{t("settings.subscriptionPanelHint")}</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.status")}</span>
                      <span className="mt-1 block font-semibold text-white">{accessLabel()}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.renewal")}</span>
                      <span className="mt-1 block font-semibold text-white">{accessStatus?.currentPeriodEnd ? formatDateTime(accessStatus.currentPeriodEnd) : "-"}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.plan")}</span>
                      <span className="mt-1 block font-semibold text-white">10 EUR/mes</span>
                    </div>
                  </div>

                  {accessStatus?.cancelAtPeriodEnd && accessStatus.currentPeriodEnd ? (
                    <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                      <span className="font-semibold">{t("settings.cancelAtPeriodEnd")}: </span>
                      {t("settings.endsOn", { date: formatDateTime(accessStatus.currentPeriodEnd) })}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void onOpenSubscriptionPortal()}
                      disabled={openingPortal || !accessStatus?.stripeCustomerId}
                      className="rounded-xl bg-[linear-gradient(135deg,#06b6d4,#2563eb)] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-[0_10px_30px_rgba(6,182,212,0.25)] transition hover:brightness-110 disabled:opacity-50"
                    >
                      {openingPortal ? t("settings.openingPortal") : t("settings.manageSubscription")}
                    </button>
                  </div>
                </section>

                <section className="max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("settings.deviceUsage")}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{t("settings.deviceUsageHint")}</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.deviceChangesUsed")}</span>
                      <span className="mt-1 block font-semibold text-white">{deviceSummary?.transfersUsed ?? 0}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.deviceChangesRemaining")}</span>
                      <span className="mt-1 block font-semibold text-white">{deviceSummary?.isAdmin ? t("deviceAccess.adminExempt") : deviceSummary?.transfersRemaining ?? 0}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.deviceActive")}</span>
                      <span className="mt-1 block font-semibold text-white">{deviceSummary?.activeDeviceName ?? "-"}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.deviceReset")}</span>
                      <span className="mt-1 block font-semibold text-white">{deviceSummary?.resetAt ? formatDateTime(deviceSummary.resetAt) : "-"}</span>
                    </div>
                  </div>
                </section>
                  
             </div>

          </div>
        </section>

        {/* DISCOGS TOKEN SECTION */}
         <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr] xl:items-start">
         <div className="space-y-8">
         <section className={panel("p-8 h-full")}>
             <h2 className="text-xl font-bold text-white mb-2">{t("settings.discogsKey")}</h2>
             <p className="text-zinc-400 text-sm mb-6">{t("settings.discogsKeyHint")}</p>
           
           <form onSubmit={onSaveToken} className="space-y-4 max-w-lg">
             <label className="block space-y-2">
                 <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("settings.discogsTokenLabel")}</span>
               <input
                 value={token}
                 onChange={(e) => setToken(e.target.value)}
                 type="password"
                  placeholder={`${t("settings.example")} XXXXXXXXXXXX`}
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
                   {savingToken ? t("settings.saving") : t("settings.saveToken")}
               </button>
               <button type="button" onClick={onDeleteToken} disabled={!isDesktop || savingToken || !hasStoredToken} className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50 transition">
                 Borrar
               </button>
             </div>
             </form>
          </section>

          <section className={panel("p-8 h-full")}>
            <h2 className="text-xl font-bold text-white mb-2">{t("settings.catalog")}</h2>
            <p className="text-zinc-400 text-sm mb-6">{t("settings.catalogHint")}</p>

            <form onSubmit={onSaveCatalog} className="space-y-4 max-w-lg">
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("settings.localDsn")}</span>
                <input
                  value={catalogDsn}
                  onChange={(event) => setCatalogDsn(event.target.value)}
                  type="password"
                  placeholder="postgresql://discogs_app:password@localhost:5432/discogs_catalog"
                  className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50 transition"
                />
              </label>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
                {t("settings.localStatus")}: <span className="font-semibold text-white">{hasCatalogDsn ? t("settings.configured") : t("settings.pending")}</span>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
                {t("settings.fallbackApi")}: <span className="font-semibold text-white break-all">{catalogApiUrl}</span>
              </div>

              {catalogNotice ? (
                <div className={`rounded-xl px-4 py-3 text-sm border ${catalogNotice.kind === "error" ? "border-rose-400/20 bg-rose-400/10 text-rose-200" : catalogNotice.kind === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"}`}>
                  {catalogNotice.text}
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                {t("settings.catalogLiveHint")}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={!isDesktop || savingCatalog} className="rounded-xl bg-[linear-gradient(135deg,#34d399,#0f766e)] px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(16,185,129,0.25)] hover:brightness-110 disabled:opacity-50 transition flex-1">
                  {savingCatalog ? t("settings.saving") : t("settings.saveLocalConnection")}
                </button>
                <button type="button" onClick={onDeleteCatalog} disabled={!isDesktop || savingCatalog || !hasCatalogDsn} className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50 transition">
                  {t("settings.delete")}
                </button>
              </div>
            </form>
          </section>
          </div>

          <section className={panel("p-8 h-full")}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white mb-2">{t("settings.savedSearches")}</h2>
               <p className="text-zinc-400 text-sm">{t("settings.savedSearchesHint")}</p>
             </div>
             <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
               <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.history")}</p>
               <p className="mt-1 text-2xl font-semibold text-white">{searches.length}</p>
             </div>
           </div>

           {searchesError ? (
             <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
               {searchesError}
             </div>
           ) : null}

            <div className="mt-6">
              <details className="group rounded-[28px] border border-white/10 bg-white/[0.04]" open={searches.length <= 3}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{t("settings.searchHistory")}</p>
                    <p className="mt-1 text-xs text-zinc-400">{t("settings.searchHistoryHint")}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition group-open:rotate-180">
                    ▼
                  </span>
                </summary>

                <div className="space-y-4 border-t border-white/10 px-5 py-5">
              {searches.map((search) => {
                const filters = search.filters;
                const yearLabel = filters.sin_anyo ? t("settings.noYear") : `${filters.year_start}-${filters.year_end}`;
                const priceLabel = filters.precio_maximo > 0 ? `${filters.precio_minimo}€-${filters.precio_maximo}€` : `${filters.precio_minimo}€+`;
               const stylesLabel = filters.styles.length ? filters.styles.join(", ") : t("settings.noStyle");
               const genresLabel = filters.genres.length ? filters.genres.join(", ") : t("settings.noGenre");

               return (
                 <article key={search.id} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                   <div className="flex flex-wrap items-start justify-between gap-4">
                     <div className="min-w-0 flex-1">
                       <h3 className="text-base font-semibold text-white">{search.summary}</h3>
                       <p className="mt-1 text-sm text-zinc-400">{formatDateTime(search.created_at)}</p>
                     </div>
                     <div className="flex flex-wrap gap-2">
                        {searchBadge(t("settings.status"), statusLabel(search.status))}
                        {searchBadge(t("settings.results"), String(search.result_count))}
                        {searchBadge(t("settings.youtube"), filters.youtube_status)}
                     </div>
                   </div>

                   <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-white/8 bg-[#0b111c] px-4 py-3 text-xs leading-6 text-zinc-400"><span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.genres")}</span><span className="mt-1 block text-zinc-300">{genresLabel}</span></div>
                      <div className="rounded-2xl border border-white/8 bg-[#0b111c] px-4 py-3 text-xs leading-6 text-zinc-400"><span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.styles")}</span><span className="mt-1 block text-zinc-300">{stylesLabel}</span></div>
                      <div className="rounded-2xl border border-white/8 bg-[#0b111c] px-4 py-3 text-xs leading-6 text-zinc-400"><span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.year")}</span><span className="mt-1 block text-zinc-300">{yearLabel}</span></div>
                      <div className="rounded-2xl border border-white/8 bg-[#0b111c] px-4 py-3 text-xs leading-6 text-zinc-400"><span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.price")}</span><span className="mt-1 block text-zinc-300">{priceLabel}</span></div>
                   </div>

                   <div className="mt-4 flex flex-wrap gap-2">
                     <button
                       type="button"
                       onClick={() => reuseSearch(search)}
                       className="rounded-2xl border border-cyan-300/30 bg-cyan-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/30"
                     >
                        {t("settings.reuseSearch")}
                     </button>
                     <button
                       type="button"
                       onClick={() => void removeSearch(search.id)}
                       className="rounded-2xl border border-rose-300/30 bg-rose-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-100 transition hover:bg-rose-300/30"
                     >
                        {t("settings.deleteSearch")}
                     </button>
                   </div>
                 </article>
               );
             })}

                {!searches.length && !searchesError ? (
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 text-center">
                     <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">{t("settings.noSearches")}</p>
                     <p className="mt-3 text-lg font-semibold text-white">{t("settings.noSearchesTitle")}</p>
                     <p className="mt-2 text-sm text-zinc-400">{t("settings.noSearchesHint")}</p>
                  </div>
                ) : null}
                </div>
              </details>
             </div>
           </section>
         </div>

          {accessStatus?.isAdmin ? (
            <section className={panel("p-8")}>
              <div className="flex items-center justify-between gap-4">
               <div>
                 <h2 className="text-xl font-bold text-white mb-2">{t("settings.adminBypass")}</h2>
                 <p className="text-zinc-400 text-sm">{t("settings.adminBypassHint")}</p>
               </div>
               <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{t("settings.users")}</p>
                 <p className="mt-1 text-2xl font-semibold text-white">{adminUsers.length}</p>
               </div>
             </div>

              {adminAccessError ? (
                <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{adminAccessError}</div>
              ) : null}

              <div className="mt-6">
                <details className="group rounded-[28px] border border-white/10 bg-white/[0.04]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{t("settings.manualAccessManagement")}</p>
                      <p className="mt-1 text-xs text-zinc-400">{t("settings.manualAccessManagementHint")}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition group-open:rotate-180">
                      ▼
                    </span>
                  </summary>

                  <div className="space-y-3 border-t border-white/10 px-5 py-5">
                    {adminUsers.map((user) => (
                      <article key={user.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                        <div>
                          <h3 className="text-sm font-semibold text-white">{user.full_name || user.email}</h3>
                          <p className="mt-1 text-xs text-zinc-500">{user.email}</p>
                          <p className="mt-2 text-xs text-zinc-400">
                            {t("settings.deviceChangesRemaining")}: {adminDeviceSummaries[user.id]?.isAdmin ? t("deviceAccess.adminExempt") : adminDeviceSummaries[user.id]?.transfersRemaining ?? 0}
                            {" · "}
                            {t("settings.deviceChangesUsed")}: {adminDeviceSummaries[user.id]?.transfersUsed ?? 0}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {user.is_admin ? searchBadge(t("settings.role"), "Admin") : null}
                          {user.bypass_subscription ? searchBadge(t("settings.bypass"), t("settings.yes")) : searchBadge(t("settings.bypass"), t("settings.no"))}
                          {searchBadge(t("settings.deviceChanges"), user.is_admin ? t("deviceAccess.adminExempt") : `+${user.device_transfer_bonus}`)}
                          <button
                            type="button"
                            onClick={() => void toggleBypass(user)}
                            disabled={togglingUserId === user.id || user.is_admin}
                            className="rounded-2xl border border-cyan-300/30 bg-cyan-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/30 disabled:opacity-50"
                          >
                            {user.is_admin ? t("settings.fixedAdmin") : togglingUserId === user.id ? t("settings.saving") : user.bypass_subscription ? t("settings.removeBypass") : t("settings.grantBypass")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void adjustDeviceBonus(user, 1)}
                            disabled={updatingBonusUserId === user.id || user.is_admin}
                            className="rounded-2xl border border-emerald-300/30 bg-emerald-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-300/30 disabled:opacity-50"
                          >
                            {updatingBonusUserId === user.id ? t("settings.saving") : t("settings.addDeviceChange")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void adjustDeviceBonus(user, -1)}
                            disabled={updatingBonusUserId === user.id || user.is_admin || user.device_transfer_bonus <= 0}
                            className="rounded-2xl border border-amber-300/30 bg-amber-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-300/30 disabled:opacity-50"
                          >
                            {t("settings.removeDeviceChange")}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              </div>
            </section>
          ) : null}

        </div>
      </div>
  );
}

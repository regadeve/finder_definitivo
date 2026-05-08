"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type CachedProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
};

type AuthSessionContextValue = {
  loading: boolean;
  session: Session | null;
  userId: string | null;
  profile: CachedProfile | null;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue>({
  loading: true,
  session: null,
  userId: null,
  profile: null,
  isAdmin: false,
  refreshProfile: async () => undefined,
});

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CachedProfile | null>(null);

  const refreshProfile = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession) {
      setSession(null);
      setProfile(null);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, is_admin")
      .eq("id", currentSession.user.id)
      .maybeSingle();

    setSession(currentSession);
    if (!data) {
      setProfile(null);
      return;
    }
    setProfile({
      id: String(data.id ?? currentSession.user.id),
      email: typeof data.email === "string" ? data.email : currentSession.user.email ?? null,
      full_name: typeof data.full_name === "string" ? data.full_name : currentSession.user.email ?? null,
      avatar_url: typeof data.avatar_url === "string" ? data.avatar_url : null,
      is_admin: Boolean(data.is_admin),
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const loadProfile = async (nextSession: Session | null) => {
      if (!nextSession) {
        if (active) {
          setProfile(null);
        }
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, is_admin")
        .eq("id", nextSession.user.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (error || !data) {
        setProfile({
          id: nextSession.user.id,
          email: nextSession.user.email ?? null,
          full_name: nextSession.user.email ?? null,
          avatar_url: null,
          is_admin: false,
        });
        return;
      }

      setProfile({
        id: String(data.id ?? nextSession.user.id),
        email: typeof data.email === "string" ? data.email : nextSession.user.email ?? null,
        full_name: typeof data.full_name === "string" ? data.full_name : nextSession.user.email ?? null,
        avatar_url: typeof data.avatar_url === "string" ? data.avatar_url : null,
        is_admin: Boolean(data.is_admin),
      });
    };

    const syncFromSession = async (nextSession: Session | null) => {
      if (!active) {
        return;
      }
      setSession(nextSession);
      await loadProfile(nextSession);
      if (active) {
        setLoading(false);
      }
    };

    void supabase.auth.getSession().then(({ data }) => syncFromSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncFromSession(nextSession);
    });

    const revalidateOnFocus = () => {
      if (document.visibilityState === "visible") {
        void refreshProfile();
      }
    };

    window.addEventListener("focus", revalidateOnFocus);
    document.addEventListener("visibilitychange", revalidateOnFocus);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("focus", revalidateOnFocus);
      document.removeEventListener("visibilitychange", revalidateOnFocus);
    };
  }, [refreshProfile]);

  const value = useMemo<AuthSessionContextValue>(() => {
    const userId = session?.user.id ?? null;
    return {
      loading,
      session,
      userId,
      profile,
      isAdmin: Boolean(profile?.is_admin),
      refreshProfile,
    };
  }, [loading, profile, refreshProfile, session]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  return useContext(AuthSessionContext);
}

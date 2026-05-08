"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OnlineUser = {
  id: string;
  email: string;
  fullName: string;
  joinedAt: string;
};

type OnlinePresenceContextValue = {
  onlineCount: number;
  users: OnlineUser[];
};

const OnlinePresenceContext = createContext<OnlinePresenceContextValue>({
  onlineCount: 0,
  users: [],
});

const CHANNEL_NAME = "finder-online-users";

function normalizeUsersFromPresence(rawState: Record<string, Array<Record<string, unknown>>>) {
  const byUserId = new Map<string, OnlineUser>();

  for (const [presenceKey, entries] of Object.entries(rawState)) {
    for (const entry of entries) {
      const fallbackId = typeof presenceKey === "string" ? presenceKey : "";
      const id = typeof entry.id === "string" && entry.id.trim().length > 0 ? entry.id : fallbackId;
      if (!id) continue;

      const email = typeof entry.email === "string" ? entry.email : "";
      const fullName = typeof entry.full_name === "string" ? entry.full_name : "";
      const joinedAt = typeof entry.joined_at === "string" ? entry.joined_at : new Date().toISOString();

      const prev = byUserId.get(id);
      if (!prev || joinedAt > prev.joinedAt) {
        byUserId.set(id, {
          id,
          email,
          fullName,
          joinedAt,
        });
      }
    }
  }

  return Array.from(byUserId.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function OnlinePresenceProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const disconnectChannel = async () => {
      if (!channel) return;
      const current = channel;
      channel = null;
      await supabase.removeChannel(current);
    };

    const connectForSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session) {
        setUsers([]);
        await disconnectChannel();
        return;
      }

      await disconnectChannel();
      supabase.realtime.setAuth(session.access_token);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      const email = String(profile?.email || session.user.email || "");
      const fullName = String(profile?.full_name || email || "Usuario");
      const selfUser: OnlineUser = {
        id: session.user.id,
        email,
        fullName,
        joinedAt: new Date().toISOString(),
      };

      setUsers([selfUser]);

      channel = supabase.channel(CHANNEL_NAME, {
        config: {
          presence: {
            key: session.user.id,
          },
        },
      });

      channel.on("presence", { event: "sync" }, () => {
        if (!active || !channel) return;
        const state = channel.presenceState<Record<string, unknown>>();
        const normalized = normalizeUsersFromPresence(state as Record<string, Array<Record<string, unknown>>>);
        if (normalized.length === 0) {
          setUsers([selfUser]);
          return;
        }
        setUsers(normalized);
      });

      channel.on("presence", { event: "join" }, () => {
        if (!active || !channel) return;
        const state = channel.presenceState<Record<string, unknown>>();
        const normalized = normalizeUsersFromPresence(state as Record<string, Array<Record<string, unknown>>>);
        setUsers(normalized.length ? normalized : [selfUser]);
      });

      channel.on("presence", { event: "leave" }, () => {
        if (!active || !channel) return;
        const state = channel.presenceState<Record<string, unknown>>();
        const normalized = normalizeUsersFromPresence(state as Record<string, Array<Record<string, unknown>>>);
        setUsers(normalized.length ? normalized : [selfUser]);
      });

      channel.subscribe(async (status) => {
        if (!active || !channel) return;
        if (status !== "SUBSCRIBED") {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            console.warn("Presence channel status:", status);
            setUsers((prev) => (prev.some((user) => user.id === selfUser.id) ? prev : [selfUser]));
          }
          return;
        }

        const trackResult = await channel.track({
          id: session.user.id,
          email,
          full_name: fullName,
          joined_at: new Date().toISOString(),
        });

        if (trackResult !== "ok") {
          console.warn("Presence track error:", trackResult);
        }

        setUsers((prev) => {
          if (prev.some((user) => user.id === selfUser.id)) {
            return prev;
          }
          return [...prev, selfUser];
        });
      });
    };

    void connectForSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        void connectForSession();
        return;
      }
      if (event === "SIGNED_OUT") {
        setUsers([]);
        void disconnectChannel();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      void disconnectChannel();
    };
  }, []);

  const value = useMemo<OnlinePresenceContextValue>(
    () => ({
      onlineCount: users.length,
      users,
    }),
    [users]
  );

  return <OnlinePresenceContext.Provider value={value}>{children}</OnlinePresenceContext.Provider>;
}

export function useOnlinePresence() {
  return useContext(OnlinePresenceContext);
}

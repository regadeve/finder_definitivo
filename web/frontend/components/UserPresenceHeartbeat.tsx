"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { touchUserPresence } from "@/lib/supabase/profile";

const HEARTBEAT_MS = 5 * 60 * 1000;

export default function UserPresenceHeartbeat() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;

    const ping = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active || !session) {
          return;
        }

        await touchUserPresence(supabase);
      } catch (error) {
        console.warn("No se pudo actualizar last_seen_at:", error);
      }
    };

    void ping();

    const intervalId = window.setInterval(() => {
      void ping();
    }, HEARTBEAT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        return;
      }

      void touchUserPresence(supabase).catch((error) => {
        console.warn("No se pudo actualizar la presencia tras autenticar:", error);
      });
    });

    return () => {
      active = false;
      window.clearInterval(intervalId);
      subscription.unsubscribe();
    };
  }, [supabase]);

  return null;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/supabase/profile";
import { navigateWithTransition } from "@/lib/view-transition";

export default function AdminMetricsShortcut({
  className,
  label = "Panel admin",
}: {
  className: string;
  label?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const nextVisible = await isCurrentUserAdmin(supabase);
        if (active) {
          setVisible(nextVisible);
        }
      } catch {
        if (active) {
          setVisible(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => navigateWithTransition(router, "/metrics")}
      className={className}
    >
      {label}
    </button>
  );
}

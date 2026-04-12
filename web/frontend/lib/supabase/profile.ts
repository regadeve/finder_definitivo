import type { SupabaseClient } from "@supabase/supabase-js";

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean;
  last_seen_at: string | null;
};

function normalizeProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id ?? ""),
    email: typeof row.email === "string" ? row.email : null,
    full_name: typeof row.full_name === "string" ? row.full_name : null,
    is_admin: Boolean(row.is_admin),
    last_seen_at: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
  };
}

export async function getCurrentUserProfile(supabase: SupabaseClient): Promise<UserProfile | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_admin, last_seen_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return normalizeProfile(data as Record<string, unknown>);
}

export async function isCurrentUserAdmin(supabase: SupabaseClient): Promise<boolean> {
  const profile = await getCurrentUserProfile(supabase);
  return Boolean(profile?.is_admin);
}

export async function touchUserPresence(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("touch_user_presence");

  if (error) {
    throw error;
  }
}

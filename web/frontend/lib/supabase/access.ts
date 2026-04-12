import type { SupabaseClient } from "@supabase/supabase-js";

export type UserAccessRow = {
  id: string;
  is_admin: boolean;
  bypass_subscription: boolean;
};

export type UserSubscriptionRow = {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
};

export type UserAccessStatus = {
  isAdmin: boolean;
  bypassSubscription: boolean;
  subscriptionStatus: string;
  hasActiveSubscription: boolean;
  canUseApp: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
};

export type AdminAccessUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean;
  bypass_subscription: boolean;
};

export function hasPaidAccess(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

export async function fetchUserAccessStatus(supabase: SupabaseClient, userId: string): Promise<UserAccessStatus> {
  const [{ data: access, error: accessError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, is_admin, bypass_subscription")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_subscriptions")
      .select("status, current_period_end, cancel_at_period_end, stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (accessError) throw accessError;
  if (subscriptionError) throw subscriptionError;

  const accessRow = access as UserAccessRow | null;
  const subscriptionRow = subscription as UserSubscriptionRow | null;
  const subscriptionStatus = subscriptionRow?.status ?? "inactive";
  const activeSubscription = hasPaidAccess(subscriptionStatus);
  const bypassSubscription = accessRow?.bypass_subscription ?? false;
  const isAdmin = accessRow?.is_admin ?? false;

  return {
    isAdmin,
    bypassSubscription,
    subscriptionStatus,
    hasActiveSubscription: activeSubscription,
    canUseApp: activeSubscription || bypassSubscription || isAdmin,
    currentPeriodEnd: subscriptionRow?.current_period_end ?? null,
    cancelAtPeriodEnd: subscriptionRow?.cancel_at_period_end ?? false,
    stripeCustomerId: subscriptionRow?.stripe_customer_id ?? null,
  };
}

export async function fetchAdminAccessUsers(supabase: SupabaseClient) {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_admin, bypass_subscription")
    .order("created_at", { ascending: false })
    .limit(100);

  if (profilesError) throw profilesError;

  return ((profiles ?? []) as Array<{ id: string; email: string; full_name: string | null; is_admin: boolean; bypass_subscription: boolean }>).map((profile) => {
    return {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      is_admin: profile.is_admin ?? false,
      bypass_subscription: profile.bypass_subscription ?? false,
    } satisfies AdminAccessUser;
  });
}

export async function setUserBypassAccess(
  supabase: SupabaseClient,
  userId: string,
  bypassSubscription: boolean,
  keepAdmin = false
) {
  const { error } = await supabase
    .from("profiles")
    .update({
      bypass_subscription: bypassSubscription,
      is_admin: keepAdmin,
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

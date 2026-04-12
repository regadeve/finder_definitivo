import type { SupabaseClient } from "@supabase/supabase-js";

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_BILLING_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
}

async function postWithSession(
  supabase: SupabaseClient,
  path: string,
  body: Record<string, string>
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("No hay sesion activa.");
  }

  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`No se pudo conectar con Billing API en ${getApiBaseUrl()}.`);
  }

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(String(json?.detail || `Error ${response.status}`));
  }

  return response.json() as Promise<{ url: string }>;
}

export async function createCheckoutSession(supabase: SupabaseClient, returnPath = "/billing") {
  return postWithSession(supabase, "/billing/create-checkout-session", { return_path: returnPath });
}

export async function createPortalSession(supabase: SupabaseClient, returnPath = "/billing") {
  return postWithSession(supabase, "/billing/create-portal-session", { return_path: returnPath });
}

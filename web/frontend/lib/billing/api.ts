import type { SupabaseClient } from "@supabase/supabase-js";

const BILLING_API_TIMEOUT_MS = 5000;

class BillingApiResponseError extends Error {}

function withTimeout(timeoutMs = BILLING_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeout),
  };
}

function getApiBaseUrls() {
  const configured = [
    process.env.NEXT_PUBLIC_BILLING_API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_BILLING_API_FALLBACK_URLS,
    "http://localhost:8010",
  ]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return configured.filter((value, index) => configured.indexOf(value) === index);
}

export async function getBillingApiAvailability() {
  for (const baseUrl of getApiBaseUrls()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { signal, clear } = withTimeout(7000);

      try {
        const response = await fetch(`${baseUrl}/health`, {
          method: "GET",
          cache: "no-store",
          signal,
        });

        if (response.ok) {
          return { ok: true as const, baseUrl };
        }
      } catch {
        // Try the next attempt or endpoint.
      } finally {
        clear();
      }

      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  }

  return {
    ok: false as const,
    baseUrl: getApiBaseUrls()[0] || "http://localhost:8010",
  };
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

  let lastConnectionError: Error | null = null;

  for (const baseUrl of getApiBaseUrls()) {
    const { signal, clear } = withTimeout();

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new BillingApiResponseError(String(json?.detail || `Error ${response.status}`));
      }

      return response.json() as Promise<{ url: string }>;
    } catch (error) {
      if (error instanceof BillingApiResponseError) {
        throw error;
      }

      if (error instanceof Error && error.name !== "AbortError") {
        lastConnectionError = error;
      }
    } finally {
      clear();
    }
  }

  if (lastConnectionError && !/Error \d+/.test(lastConnectionError.message)) {
    throw lastConnectionError;
  }

  const primaryUrl = getApiBaseUrls()[0] || "http://localhost:8010";
  throw new Error(`No se pudo conectar con Billing API en ${primaryUrl}.`);
}

function buildReturnUrl(returnPath: string) {
  if (typeof window === "undefined") return "";
  return new URL(returnPath, window.location.origin).toString();
}

export async function createCheckoutSession(supabase: SupabaseClient, returnPath = "/billing/") {
  return postWithSession(supabase, "/billing/create-checkout-session", {
    return_path: returnPath,
    return_url: buildReturnUrl(returnPath),
  });
}

export async function createPortalSession(supabase: SupabaseClient, returnPath = "/billing/") {
  return postWithSession(supabase, "/billing/create-portal-session", {
    return_path: returnPath,
    return_url: buildReturnUrl(returnPath),
  });
}

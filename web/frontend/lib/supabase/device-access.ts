import type { SupabaseClient } from "@supabase/supabase-js";

const DEVICE_ID_STORAGE_KEY = "103finder.device-id";
const DEVICE_NAME_STORAGE_KEY = "103finder.device-name";

export type DeviceAccessState = {
  status: "authorized" | "transfer_available" | "limit_reached";
  isAdmin: boolean;
  transfersUsed: number;
  transfersLimit: number | null;
  transfersRemaining: number | null;
  resetAt: string | null;
  activeDeviceId: string | null;
  activeDeviceName: string | null;
  requestedDeviceId?: string | null;
  requestedDeviceName?: string | null;
};

export type DeviceAccessSummary = {
  userId: string;
  isAdmin: boolean;
  bonus: number;
  transfersUsed: number;
  transfersLimit: number | null;
  transfersRemaining: number | null;
  resetAt: string | null;
  activeDeviceId: string | null;
  activeDeviceName: string | null;
};

function getStoredValue(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function setStoredValue(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

export function getOrCreateDeviceId() {
  const existing = getStoredValue(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;

  const next = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  setStoredValue(DEVICE_ID_STORAGE_KEY, next);
  return next;
}

export function getOrCreateDeviceName() {
  const existing = getStoredValue(DEVICE_NAME_STORAGE_KEY);
  if (existing) return existing;

  const platform = typeof navigator !== "undefined" ? navigator.platform || "Unknown platform" : "Unknown platform";
  const next = `103 Finder on ${platform}`;
  setStoredValue(DEVICE_NAME_STORAGE_KEY, next);
  return next;
}

function getPlatformName() {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.userAgent || navigator.platform || "unknown";
}

function normalizeDeviceAccessState(value: unknown): DeviceAccessState {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    status: String(row.status ?? "limit_reached") as DeviceAccessState["status"],
    isAdmin: Boolean(row.isAdmin),
    transfersUsed: Number(row.transfersUsed ?? 0),
    transfersLimit: row.transfersLimit == null ? null : Number(row.transfersLimit),
    transfersRemaining: row.transfersRemaining == null ? null : Number(row.transfersRemaining),
    resetAt: typeof row.resetAt === "string" ? row.resetAt : null,
    activeDeviceId: typeof row.activeDeviceId === "string" ? row.activeDeviceId : null,
    activeDeviceName: typeof row.activeDeviceName === "string" ? row.activeDeviceName : null,
    requestedDeviceId: typeof row.requestedDeviceId === "string" ? row.requestedDeviceId : null,
    requestedDeviceName: typeof row.requestedDeviceName === "string" ? row.requestedDeviceName : null,
  };
}

function normalizeDeviceAccessSummary(value: unknown): DeviceAccessSummary {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    userId: String(row.userId ?? ""),
    isAdmin: Boolean(row.isAdmin),
    bonus: Number(row.bonus ?? 0),
    transfersUsed: Number(row.transfersUsed ?? 0),
    transfersLimit: row.transfersLimit == null ? null : Number(row.transfersLimit),
    transfersRemaining: row.transfersRemaining == null ? null : Number(row.transfersRemaining),
    resetAt: typeof row.resetAt === "string" ? row.resetAt : null,
    activeDeviceId: typeof row.activeDeviceId === "string" ? row.activeDeviceId : null,
    activeDeviceName: typeof row.activeDeviceName === "string" ? row.activeDeviceName : null,
  };
}

async function callDeviceRpc(supabase: SupabaseClient, fn: "ensure_user_device_access" | "transfer_user_device_access") {
  const deviceId = getOrCreateDeviceId();
  const deviceName = getOrCreateDeviceName();

  const { data, error } = await supabase.rpc(fn, {
    p_device_id: deviceId,
    p_device_name: deviceName,
    p_platform: getPlatformName(),
    p_app_version: "0.1.5",
  });

  if (error) {
    throw error;
  }

  return normalizeDeviceAccessState(data);
}

export async function ensureDeviceAccess(supabase: SupabaseClient) {
  return callDeviceRpc(supabase, "ensure_user_device_access");
}

export async function transferDeviceAccess(supabase: SupabaseClient) {
  return callDeviceRpc(supabase, "transfer_user_device_access");
}

export async function getUserDeviceAccessSummary(supabase: SupabaseClient, userId?: string) {
  const { data, error } = await supabase.rpc("get_user_device_access_summary", {
    p_target_user_id: userId ?? null,
  });

  if (error) {
    throw error;
  }

  return normalizeDeviceAccessSummary(data);
}

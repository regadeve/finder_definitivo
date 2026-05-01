import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadCatalogDsn } from "@/lib/desktop/catalog-config";
import { toErrorMessage } from "@/lib/desktop/errors";
import { isTauriRuntime } from "@/lib/desktop/runtime";

export type SearchCard = {
  title: string;
  artist: string;
  year: number | null;
  have: number | null;
  want: number | null;
  genres: string[];
  styles: string[];
  formats: string[];
  country: string;
  has_youtube: boolean;
  num_for_sale: number;
  lowest_price: number | null;
  uri: string;
  thumb: string;
};

export type SearchBackend = "discogs-live" | "catalog-local" | "catalog-hybrid";

export type SearchFiltersPayload = {
  year_start: number;
  year_end: number;
  have_min: number;
  have_max: number;
  want_min: number;
  want_max: number;
  max_versions: number;
  countries_selected: string[];
  formats_selected: string[];
  type_selected: string;
  genres: string[];
  styles: string[];
  strict_genre: boolean;
  strict_style: boolean;
  sin_anyo: boolean;
  solo_en_venta: boolean;
  precio_minimo: number;
  precio_maximo: number;
  max_copias_venta: number;
  tope_resultados: number;
  youtube_status: string;
  not_on_label_only: boolean;
  exclude_various: boolean;
};

type StreamPayload = {
  page?: number;
  total_pages?: number;
  found?: number;
  processed?: number;
  card?: SearchCard;
  idx?: number;
  reason?: string;
  message?: string;
};

type SearchEventEnvelope = {
  search_id: string;
  event: "status" | "item" | "done";
  payload: StreamPayload;
};

type SearchStreamOptions = {
  userId: string;
  filters: SearchFiltersPayload;
  backend: SearchBackend;
  signal: AbortSignal;
  onStatus: (payload: StreamPayload) => void;
  onItem: (payload: StreamPayload) => void;
  onDone: (payload: StreamPayload) => void;
};

function getProxyApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

function getCatalogProxyUrl(backend: SearchBackend) {
  const mode = backend === "catalog-hybrid" ? "catalog-hybrid" : "catalog-local";
  return `${getProxyApiUrl()}/catalog/search/stream?mode=${encodeURIComponent(mode)}`;
}

function shouldPreferProxy() {
  return Boolean(process.env.NEXT_PUBLIC_API_URL);
}

async function hasLocalCatalogDsn() {
  try {
    const dsn = await loadCatalogDsn();
    return dsn.trim().length > 0;
  } catch {
    return false;
  }
}

export const DESKTOP_ONLY_SEARCH_MESSAGE = "La busqueda de Discogs solo esta disponible en la app de escritorio con token local del usuario.";

function parseSseChunk(chunk: string) {
  const lines = chunk.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  const dataLine = lines.find((line) => line.startsWith("data: "));

  const event = eventLine?.replace("event: ", "").trim();
  const dataStr = dataLine?.replace("data: ", "") ?? "{}";
  if (!event) {
    return null;
  }

  try {
    return {
      event,
      payload: JSON.parse(dataStr) as StreamPayload,
    };
  } catch {
    return null;
  }
}

async function startProxySearchStream({ filters, signal, onStatus, onItem, onDone }: SearchStreamOptions) {
  const res = await fetch(`${getProxyApiUrl()}/search/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const json = await res.json();
      detail = json?.detail ? ` · ${String(json.detail)}` : "";
    } catch {}
    throw new Error(`Error API: ${res.status}${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const chunk of parts) {
      const parsed = parseSseChunk(chunk);
      if (!parsed) {
        continue;
      }

      if (parsed.event === "status") {
        onStatus(parsed.payload);
      } else if (parsed.event === "item") {
        onItem(parsed.payload);
      } else if (parsed.event === "done") {
        onDone(parsed.payload);
        return;
      }
    }
  }
}

async function startCatalogProxySearchStream({ filters, backend, signal, onStatus, onItem, onDone }: SearchStreamOptions) {
  const res = await fetch(getCatalogProxyUrl(backend), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const json = await res.json();
      detail = json?.detail ? ` · ${String(json.detail)}` : "";
    } catch {}
    throw new Error(`Error API catalogo: ${res.status}${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const chunk of parts) {
      const parsed = parseSseChunk(chunk);
      if (!parsed) {
        continue;
      }

      if (parsed.event === "status") {
        onStatus(parsed.payload);
      } else if (parsed.event === "item") {
        onItem(parsed.payload);
      } else if (parsed.event === "done") {
        onDone(parsed.payload);
        return;
      }
    }
  }
}

function getBackendCommand(backend: SearchBackend) {
  if (backend === "catalog-local") {
    return "start_catalog_search";
  }

  if (backend === "catalog-hybrid") {
    return "start_hybrid_search";
  }

  return "start_discogs_search";
}

function getBackendLabel(backend: SearchBackend) {
  if (backend === "catalog-local") {
    return "catalogo local PostgreSQL";
  }

  if (backend === "catalog-hybrid") {
    return "catalogo local + Discogs live";
  }

  return "Discogs live";
}

async function startDesktopSearchStream({ userId, filters, backend, signal, onStatus, onItem, onDone }: SearchStreamOptions) {
  return new Promise<void>(async (resolve, reject) => {
    let finished = false;
    let searchId = "";
    let firstEventSeen = false;
    let inactivityNoticeTimer: number | null = null;

    const clearInactivityNoticeTimer = () => {
      if (inactivityNoticeTimer !== null) {
        window.clearTimeout(inactivityNoticeTimer);
        inactivityNoticeTimer = null;
      }
    };

    const armInactivityNotice = (message: string, timeoutMs: number) => {
      clearInactivityNoticeTimer();
      inactivityNoticeTimer = window.setTimeout(() => {
        if (finished) {
          return;
        }

        onStatus({ message });
        armInactivityNotice(message, timeoutMs);
      }, timeoutMs);
    };

    let unlistenRef: (() => void) | null = null;

    const abortHandler = () => {
      if (searchId) {
        void invoke("cancel_discogs_search", { searchId }).catch(() => undefined);
      }
      if (!finished) {
        clearInactivityNoticeTimer();
        unlistenRef?.();
        reject(new DOMException("Search aborted", "AbortError"));
      }
    };

    armInactivityNotice(`La busqueda sigue preparando resultados en ${getBackendLabel(backend)}.`, 12000);

    const unlisten = await listen<SearchEventEnvelope>("discogs-search", (event) => {
      const envelope = event.payload;
      if (!envelope) {
        return;
      }

      if (!searchId && envelope.search_id) {
        searchId = envelope.search_id;
      }

      if (envelope.search_id !== searchId) {
        return;
      }

      firstEventSeen = true;
      armInactivityNotice(`La busqueda sigue en curso en ${getBackendLabel(backend)}.`, 45000);

      if (envelope.event === "status") {
        onStatus(envelope.payload);
        return;
      }

      if (envelope.event === "item") {
        onItem(envelope.payload);
        return;
      }

      if (envelope.event === "done") {
        finished = true;
        signal.removeEventListener("abort", abortHandler);
        clearInactivityNoticeTimer();
        unlisten();

        if (envelope.payload.reason === "error") {
          reject(new Error(envelope.payload.message || "Fallo la busqueda local de Discogs."));
          return;
        }

        onDone(envelope.payload);
        resolve();
      }
    });
    unlistenRef = unlisten;

    if (signal.aborted) {
      abortHandler();
      return;
    }

    signal.addEventListener("abort", abortHandler, { once: true });

    try {
      searchId = await invoke<string>(getBackendCommand(backend), { userId, filters });
      if (!firstEventSeen) {
        armInactivityNotice(`La busqueda se inicio en ${getBackendLabel(backend)} y sigue esperando resultados.`, 12000);
      }
    } catch (error) {
      signal.removeEventListener("abort", abortHandler);
      clearInactivityNoticeTimer();
      unlisten();
      reject(new Error(toErrorMessage(error, "No se pudo iniciar la busqueda local.")));
    }
  });
}

export function getSearchRuntimeLabel(backend: SearchBackend) {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    if (backend === "catalog-local") {
      return "desktop-local-catalog";
    }

    if (backend === "catalog-hybrid") {
      return "desktop-hybrid-catalog-discogs";
    }

    return "desktop-local-discogs";
  }

  if (backend === "catalog-local" || backend === "catalog-hybrid") {
    return getProxyApiUrl();
  }

  if (shouldPreferProxy()) {
    return getProxyApiUrl();
  }

  return "backend-proxy";
}

export async function startSearchStream(options: SearchStreamOptions) {
  const isDesktop = await isTauriRuntime();

  if (options.backend === "catalog-local" || options.backend === "catalog-hybrid") {
    if (isDesktop && (await hasLocalCatalogDsn())) {
      return startDesktopSearchStream(options);
    }

    return startCatalogProxySearchStream(options);
  }

  if (!isDesktop) {
    if (shouldPreferProxy()) {
      return startProxySearchStream(options);
    }
    throw new Error(DESKTOP_ONLY_SEARCH_MESSAGE);
  }

  return startDesktopSearchStream(options);
}

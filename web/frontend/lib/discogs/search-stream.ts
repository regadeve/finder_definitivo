import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  signal: AbortSignal;
  onStatus: (payload: StreamPayload) => void;
  onItem: (payload: StreamPayload) => void;
  onDone: (payload: StreamPayload) => void;
};

function getProxyApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

function shouldPreferProxy() {
  return Boolean(process.env.NEXT_PUBLIC_API_URL);
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

async function startDesktopSearchStream({ userId, filters, signal, onStatus, onItem, onDone }: SearchStreamOptions) {
  return new Promise<void>(async (resolve, reject) => {
    let finished = false;
    let searchId = "";

    const abortHandler = () => {
      if (searchId) {
        void invoke("cancel_discogs_search", { searchId }).catch(() => undefined);
      }
      if (!finished) {
        unlisten();
        reject(new DOMException("Search aborted", "AbortError"));
      }
    };

    const unlisten = await listen<SearchEventEnvelope>("discogs-search", (event) => {
      const envelope = event.payload;
      if (!envelope || envelope.search_id !== searchId) {
        return;
      }

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
        unlisten();

        if (envelope.payload.reason === "error") {
          reject(new Error(envelope.payload.message || "Fallo la busqueda local de Discogs."));
          return;
        }

        onDone(envelope.payload);
        resolve();
      }
    });

    if (signal.aborted) {
      abortHandler();
      return;
    }

    signal.addEventListener("abort", abortHandler, { once: true });

    try {
      searchId = await invoke<string>("start_discogs_search", { userId, filters });
    } catch (error) {
      signal.removeEventListener("abort", abortHandler);
      unlisten();
      reject(new Error(toErrorMessage(error, "No se pudo iniciar la busqueda local.")));
    }
  });
}

export function getSearchRuntimeLabel() {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return "desktop-local-discogs";
  }

  if (shouldPreferProxy()) {
    return getProxyApiUrl();
  }

  return "backend-proxy";
}

export async function startSearchStream(options: SearchStreamOptions) {
  const isDesktop = await isTauriRuntime();

  if (!isDesktop) {
    throw new Error(DESKTOP_ONLY_SEARCH_MESSAGE);
  }

  return startDesktopSearchStream(options);
}

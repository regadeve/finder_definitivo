import type { SupabaseClient } from "@supabase/supabase-js";
import { reportYearlessReleaseHit } from "@/lib/supabase/yearless-releases";
import { insertUserSearch, updateUserSearch } from "@/lib/supabase/user-searches";
import { startSearchStream, type SearchCard, type SearchFiltersPayload } from "@/lib/discogs/search-stream";

type SearchSessionState = {
  filters: SearchFiltersPayload;
  running: boolean;
  status: string;
  processedCount: number;
  foundCount: number;
  pageInfo: { page: number; total: number };
  items: SearchCard[];
};

const listeners = new Set<() => void>();

let abortController: AbortController | null = null;
let searchHistoryId: number | null = null;
let reportedYearlessUris = new Set<string>();

let state: SearchSessionState = {
  filters: {
    year_start: 1995,
    year_end: 1995,
    have_min: 0,
    have_max: 80,
    want_min: 0,
    want_max: 0,
    max_versions: 2,
    countries_selected: [],
    formats_selected: [],
    type_selected: "Todos",
    genres: ["Electronic"],
    styles: ["EBM"],
    strict_genre: false,
    strict_style: false,
    sin_anyo: false,
    solo_en_venta: false,
    precio_minimo: 0,
    precio_maximo: 0,
    max_copias_venta: 0,
    tope_resultados: 0,
    youtube_status: "Todos",
  },
  running: false,
  status: "Ajusta los filtros arriba y busca.",
  processedCount: 0,
  foundCount: 0,
  pageInfo: { page: 0, total: 0 },
  items: [],
};

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function patchState(patch: Partial<SearchSessionState>) {
  state = { ...state, ...patch };
  emit();
}

export function subscribeSearchSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSearchSessionState() {
  return state;
}

export function setSearchSessionFilters(filters: SearchFiltersPayload) {
  patchState({ filters });
}

export async function stopSearchSession(supabase: SupabaseClient) {
  abortController?.abort();
  abortController = null;
  patchState({ running: false, status: "Busqueda detenida." });

  if (searchHistoryId) {
    const currentFoundCount = getSearchSessionState().foundCount;
    void updateUserSearch(supabase, searchHistoryId, { status: "aborted", result_count: currentFoundCount }).catch(() => undefined);
    searchHistoryId = null;
  }
}

export async function startSearchSession(supabase: SupabaseClient, userId: string, filters: SearchFiltersPayload) {
  abortController?.abort();
  abortController = new AbortController();
  reportedYearlessUris = new Set();

  patchState({
    filters,
    running: true,
    status: "Conectando con Discogs...",
    processedCount: 0,
    foundCount: 0,
    pageInfo: { page: 0, total: 0 },
    items: [],
  });

  searchHistoryId = null;
  try {
    searchHistoryId = await insertUserSearch(supabase, userId, filters);
  } catch {
    searchHistoryId = null;
  }

  try {
    await startSearchStream({
      userId,
      filters,
      signal: abortController.signal,
      onStatus: (payload) => {
        patchState({
          pageInfo: { page: payload.page ?? 0, total: payload.total_pages ?? 0 },
          foundCount: payload.found ?? 0,
          processedCount: payload.processed ?? 0,
          status: `Pagina ${payload.page}/${payload.total_pages} · procesados ${payload.processed} · encontrados ${payload.found}`,
        });
      },
      onItem: (payload) => {
        if (!payload.card) return;

        const card = payload.card as SearchCard;
        patchState({ items: [...getSearchSessionState().items, card] });

        const missingYear = card.year === null || card.year === 0;
        if (!missingYear || !card.uri || reportedYearlessUris.has(card.uri)) {
          return;
        }

        reportedYearlessUris.add(card.uri);
        void reportYearlessReleaseHit(supabase, card).catch(() => undefined);
      },
      onDone: (payload) => {
        patchState({
          running: false,
          foundCount: payload.found ?? 0,
          status: `Terminado · ${payload.found} resultados.`,
        });
        abortController = null;

        if (searchHistoryId) {
          void updateUserSearch(supabase, searchHistoryId, { status: "completed", result_count: payload.found ?? 0 }).catch(() => undefined);
          searchHistoryId = null;
        }
      },
    });
  } catch {
    if (!abortController?.signal.aborted) {
      patchState({ running: false, status: "Error de conexion con Discogs." });
      if (searchHistoryId) {
        void updateUserSearch(supabase, searchHistoryId, { status: "failed", result_count: getSearchSessionState().foundCount }).catch(() => undefined);
        searchHistoryId = null;
      }
    }
    abortController = null;
  }
}

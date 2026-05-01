import type { SearchBackend } from "@/lib/discogs/search-stream";

const STORAGE_KEY = "finder.search.backend";

export const DEFAULT_SEARCH_BACKEND: SearchBackend = "discogs-live";

export function getSearchBackendLabel(backend: SearchBackend) {
  if (backend === "catalog-local") {
    return "Catalogo local";
  }

  if (backend === "catalog-hybrid") {
    return "Catalogo + live";
  }

  return "Discogs live";
}

export function loadPreferredSearchBackend() {
  if (typeof window === "undefined") {
    return DEFAULT_SEARCH_BACKEND;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "catalog-local" || stored === "catalog-hybrid") {
    return stored;
  }

  return DEFAULT_SEARCH_BACKEND;
}

export function savePreferredSearchBackend(backend: SearchBackend) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, backend);
}

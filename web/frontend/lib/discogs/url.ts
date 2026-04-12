import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "@/lib/desktop/runtime";

async function openExternalUrl(href: string) {
  if (!href || href === "#") {
    return;
  }

  if (await isTauriRuntime()) {
    await openUrl(href);
    return;
  }

  if (typeof window !== "undefined") {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

export function getDiscogsHref(uri: string) {
  if (!uri) return "#";
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  return `https://www.discogs.com${uri.startsWith("/") ? uri : `/${uri}`}`;
}

export async function openDiscogsRelease(uri: string) {
  await openExternalUrl(getDiscogsHref(uri));
}

export function getGoogleSearchHref(artist: string, release: string) {
  const query = [artist, release].map((value) => value.trim()).filter(Boolean).join(" ");
  if (!query) {
    return "#";
  }

  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export async function openGoogleSearch(artist: string, release: string) {
  await openExternalUrl(getGoogleSearchHref(artist, release));
}

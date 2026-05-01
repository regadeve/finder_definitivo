export const appRoutes = {
  home: "/",
  login: "/login/",
  billing: "/billing/",
  search: "/search/",
  favorites: "/favorites/",
  listened: "/listened/",
  settings: "/settings/",
  metrics: "/metrics/",
} as const;

export function normalizeAppPath(href: string) {
  if (!href.startsWith("/")) {
    return href;
  }

  const [pathnameWithQuery, hash = ""] = href.split("#");
  const [pathname, query = ""] = pathnameWithQuery.split("?");

  const normalizedPathname = pathname === "/" || pathname.endsWith("/") ? pathname : `${pathname}/`;
  const normalizedQuery = query ? `?${query}` : "";
  const normalizedHash = hash ? `#${hash}` : "";

  return `${normalizedPathname}${normalizedQuery}${normalizedHash}`;
}

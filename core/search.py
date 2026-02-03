# core/search.py

from typing import Any, Dict, List, Optional, Callable
from .models import SearchFilters
from .discogs_client import DiscogsClient

ProgressCallback = Callable[[int, int, int, int], None]
FoundCallback = Callable[[dict, int], None]
# FoundCallback(card, idx_found)


def build_search_params(f: SearchFilters) -> Dict[str, Any]:
    return {
        "per_page": 100,  # más rápido
        "page": 1,
        "sort": "title",
        "sort_order": "asc",
        **({"year": str(f.year_start)} if (not f.sin_anyo and f.year_start == f.year_end) else {}),
        **({"year": f"{f.year_start}-{f.year_end}"} if (not f.sin_anyo and f.year_start != f.year_end) else {}),
        **({"type": f.type_selected} if f.type_selected != "Todos" else {}),
        **({"format": f.format_selected} if (f.format_selected != "Todos" and f.type_selected != "master") else {}),
        **({"country": f.country} if f.country else {}),
        **({"genre": f.genres} if f.genres else {}),
        **({"style": f.styles} if f.styles else {}),
    }


def pasa_filtros_detalle(details: dict, f: SearchFilters) -> bool:
    have = details.get("community", {}).get("have", 9999)
    if have >= f.have_limit:
        return False

    release_year = details.get("year", None)
    if f.sin_anyo:
        if release_year is not None and release_year != 0:
            return False
    else:
        if release_year is None or release_year == 0:
            return False
        if not (f.year_start <= int(release_year) <= f.year_end):
            return False

    release_styles = details.get("styles") or []
    release_genres = details.get("genres") or []

    # AND styles
    if f.styles and not set(s.lower() for s in f.styles).issubset({s.lower() for s in release_styles}):
        return False
    # strict styles
    if f.strict_style and set(map(str.lower, release_styles)) != set(map(str.lower, f.styles)):
        return False

    # AND genres
    if f.genres and not set(g.lower() for g in f.genres).issubset({g.lower() for g in release_genres}):
        return False
    # strict genres
    if f.strict_genre and set(map(str.lower, release_genres)) != set(map(str.lower, f.genres)):
        return False

    # sale / price
    if f.solo_en_venta and (details.get("num_for_sale", 0) <= 0):
        return False

    if f.precio_minimo and isinstance(details.get("lowest_price", None), (int, float)):
        if float(details["lowest_price"]) < float(f.precio_minimo):
            return False

    if f.max_copias_venta and details.get("num_for_sale", 0) > int(f.max_copias_venta):
        return False

    return True


def get_versions_count(client: DiscogsClient, base: str, master_id: int) -> int:
    url = f"{base}/masters/{master_id}/versions"
    data = client.get(url, params={"per_page": 1, "page": 1})
    return int(data.get("pagination", {}).get("items", 0))


def search_discogs_stream(
    client: DiscogsClient,
    search_url: str,
    base: str,
    f: SearchFilters,
    *,
    max_pages: int = 25,
    progress_cb: Optional[ProgressCallback] = None,
    on_found: Optional[FoundCallback] = None,
) -> List[dict]:
    """
    Streaming real:
    - Llama a on_found(card, idx_found) en cuanto encuentra un resultado.
    - Devuelve también la lista final por si la quieres usar para tabla/CSV.
    """

    params = build_search_params(f)

    # first page to get total pages
    first = client.get(search_url, params=params)
    total_pages = int(first.get("pagination", {}).get("pages", 1))

    # si no hay tope de resultados, limita páginas para no eternizarse
    if not (f.tope_resultados and int(f.tope_resultados) > 0):
        total_pages = min(total_pages, int(max_pages))

    resultados: List[dict] = []
    processed = 0
    found = 0

    for page in range(1, total_pages + 1):
        params["page"] = page

        try:
            data = client.get(search_url, params=params)
            items = data.get("results", []) or []
        except Exception:
            if progress_cb:
                progress_cb(page, total_pages, found, processed)
            continue

        for item in items:
            processed += 1
            resource_url = item.get("resource_url")
            if not resource_url:
                continue

            try:
                details = client.get(resource_url)
            except Exception:
                continue

            if not pasa_filtros_detalle(details, f):
                continue

            # versions filter
            master_id = details.get("master_id")
            if master_id and f.max_versions:
                try:
                    num_versions = get_versions_count(client, base, int(master_id))
                    if num_versions > f.max_versions:
                        continue
                except Exception:
                    pass

            release_genres = details.get("genres") or []
            release_styles = details.get("styles") or []

            card = {
                "Título": details.get("title"),
                "Artista": details.get("artists_sort"),
                "Año": details.get("year"),
                "Have": details.get("community", {}).get("have"),
                "Géneros": ", ".join(release_genres),
                "Estilos": ", ".join(release_styles),
                "En venta": details.get("num_for_sale", 0),
                "Precio más bajo": details.get("lowest_price", "N/D"),
                "Enlace": details.get("uri"),
                "Imagen": item.get("thumb", ""),
            }

            resultados.append(card)
            found += 1

            # ✅ streaming: lo pintas al momento desde app.py
            if on_found:
                on_found(card, found)

            if f.tope_resultados and found >= int(f.tope_resultados):
                if progress_cb:
                    progress_cb(page, total_pages, found, processed)
                return resultados

        if progress_cb:
            progress_cb(page, total_pages, found, processed)

    return resultados

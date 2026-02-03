import os
import time
import json
import requests
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

BASE = "https://api.discogs.com"
SEARCH_URL = f"{BASE}/database/search"


def discogs_headers() -> Dict[str, str]:
    token = os.getenv("DISCOGS_TOKEN", "").strip()
    ua = os.getenv("DISCOGS_USER_AGENT", "DiscogsFinder/1.0 (local)")
    if not token:
        # OJO: no lanzar RuntimeError, mejor controlarlo en endpoints con HTTPException
        return {
            "User-Agent": ua,
            "Authorization": "Discogs token=",
        }
    return {
        "User-Agent": ua,
        "Authorization": f"Discogs token={token}",
    }


class SearchFilters(BaseModel):
    year_start: int = 1995
    year_end: int = 1995
    have_limit: int = 20
    max_versions: int = 2
    country: Optional[str] = ""
    format_selected: str = "Todos"  # Todos/CD/Vinyl
    type_selected: str = "Todos"    # Todos/release/master
    genres: List[str] = []
    styles: List[str] = []
    strict_genre: bool = False
    strict_style: bool = False
    sin_anyo: bool = False
    solo_en_venta: bool = False
    precio_minimo: float = 0
    max_copias_venta: int = 0
    tope_resultados: int = 0
    max_pages: int = 25


app = FastAPI(title="Discogs Finder API")

# CORS para Next en local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session = requests.Session()


def _sleep_for_rate(resp: requests.Response):
    try:
        remaining = int(resp.headers.get("X-Discogs-Ratelimit-Remaining", "60"))
    except Exception:
        remaining = 60
    if remaining <= 1:
        time.sleep(1.2)


def discogs_get(url: str, params: Optional[dict] = None, timeout: int = 30) -> dict:
    headers = discogs_headers()

    # Si no hay token, Discogs devolverá 401; devolvemos error claro
    token = os.getenv("DISCOGS_TOKEN", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Falta DISCOGS_TOKEN en variables de entorno.")

    backoff = 1.0
    last_exc: Optional[Exception] = None

    for _ in range(6):
        try:
            r = session.get(url, headers=headers, params=params, timeout=timeout)

            if r.status_code == 401:
                # Token incorrecto o sin permisos
                raise HTTPException(status_code=400, detail="Token de Discogs inválido o no autorizado (401).")

            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(backoff)
                backoff = min(backoff * 2, 20)
                last_exc = Exception(f"HTTP {r.status_code}")
                continue

            r.raise_for_status()
            _sleep_for_rate(r)
            return r.json()

        except HTTPException:
            raise
        except Exception as e:
            last_exc = e
            time.sleep(backoff)
            backoff = min(backoff * 2, 20)

    raise HTTPException(status_code=400, detail=str(last_exc or "Fallo desconocido"))


def build_params(f: SearchFilters) -> Dict[str, Any]:
    params: Dict[str, Any] = {
        "per_page": 100,
        "page": 1,
        "sort": "title",
        "sort_order": "asc",
    }

    if not f.sin_anyo:
        params["year"] = str(f.year_start) if f.year_start == f.year_end else f"{f.year_start}-{f.year_end}"

    if f.type_selected != "Todos":
        params["type"] = f.type_selected

    if f.format_selected != "Todos" and f.type_selected != "master":
        params["format"] = f.format_selected

    if f.country:
        params["country"] = f.country

    if f.genres:
        params["genre"] = f.genres

    if f.styles:
        params["style"] = f.styles

    return params


def passes_details(details: dict, f: SearchFilters) -> bool:
    have = details.get("community", {}).get("have", 9999)
    if have >= f.have_limit:
        return False

    year = details.get("year", None)
    if f.sin_anyo:
        if year not in (None, 0):
            return False
    else:
        if year in (None, 0):
            return False
        if not (f.year_start <= int(year) <= f.year_end):
            return False

    release_styles = details.get("styles") or []
    release_genres = details.get("genres") or []

    if f.styles and not set(s.lower() for s in f.styles).issubset({s.lower() for s in release_styles}):
        return False
    if f.strict_style and set(map(str.lower, release_styles)) != set(map(str.lower, f.styles)):
        return False

    if f.genres and not set(g.lower() for g in f.genres).issubset({g.lower() for g in release_genres}):
        return False
    if f.strict_genre and set(map(str.lower, release_genres)) != set(map(str.lower, f.genres)):
        return False

    if f.solo_en_venta and (details.get("num_for_sale", 0) <= 0):
        return False

    if f.precio_minimo and isinstance(details.get("lowest_price", None), (int, float)):
        if float(details["lowest_price"]) < float(f.precio_minimo):
            return False

    if f.max_copias_venta and details.get("num_for_sale", 0) > int(f.max_copias_venta):
        return False

    return True


def get_versions_count(master_id: int) -> int:
    url = f"{BASE}/masters/{master_id}/versions"
    data = discogs_get(url, params={"per_page": 1, "page": 1})
    return int(data.get("pagination", {}).get("items", 0))


# -------------------------
# Rutas básicas para no ver 404
# -------------------------
@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "Discogs Finder API running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health():
    token_ok = bool(os.getenv("DISCOGS_TOKEN", "").strip())
    return {"ok": True, "discogs_token_loaded": token_ok}


@app.post("/search/stream")
def search_stream(filters: SearchFilters):
    """
    Devuelve un stream SSE (text/event-stream) con eventos:
    - event: status  data: {...}
    - event: item    data: {...card...}
    - event: done    data: {...}
    """

    # Validación token antes de arrancar
    if not os.getenv("DISCOGS_TOKEN", "").strip():
        raise HTTPException(status_code=400, detail="Falta DISCOGS_TOKEN en variables de entorno.")

    try:
        params = build_params(filters)
        first = discogs_get(SEARCH_URL, params=params)
        total_pages = int(first.get("pagination", {}).get("pages", 1))

        # si hay tope_resultados, dejamos que pare por items
        if not (filters.tope_resultados and filters.tope_resultados > 0):
            total_pages = min(total_pages, int(filters.max_pages))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    def gen():
        found = 0
        processed = 0

        def send(event: str, payload: dict):
            return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

        yield send("status", {"page": 1, "total_pages": total_pages, "found": 0, "processed": 0})

        for page in range(1, total_pages + 1):
            params["page"] = page
            try:
                data = discogs_get(SEARCH_URL, params=params)
                items = data.get("results", []) or []
            except Exception:
                yield send("status", {"page": page, "total_pages": total_pages, "found": found, "processed": processed})
                continue

            for item in items:
                processed += 1
                resource_url = item.get("resource_url")
                if not resource_url:
                    continue

                try:
                    details = discogs_get(resource_url, params=None)
                except Exception:
                    continue

                if not passes_details(details, filters):
                    continue

                master_id = details.get("master_id")
                if master_id and filters.max_versions:
                    try:
                        if get_versions_count(int(master_id)) > filters.max_versions:
                            continue
                    except Exception:
                        pass

                card = {
                    "title": details.get("title"),
                    "artist": details.get("artists_sort"),
                    "year": details.get("year"),
                    "have": details.get("community", {}).get("have"),
                    "genres": details.get("genres") or [],
                    "styles": details.get("styles") or [],
                    "num_for_sale": details.get("num_for_sale", 0),
                    "lowest_price": details.get("lowest_price", None),
                    "uri": details.get("uri"),
                    "thumb": item.get("thumb", ""),
                }

                found += 1
                yield send("item", {"idx": found, "card": card})

                if filters.tope_resultados and found >= int(filters.tope_resultados):
                    yield send("done", {"found": found, "processed": processed})
                    return

            yield send("status", {"page": page, "total_pages": total_pages, "found": found, "processed": processed})

        yield send("done", {"found": found, "processed": processed})

    return StreamingResponse(gen(), media_type="text/event-stream")

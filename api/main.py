import os
import time
import json
import math
import asyncio
import httpx
import stripe
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from api.catalog_search import collect_catalog_search, parse_catalog_search_mode, stream_catalog_search

load_dotenv()

BASE = "https://api.discogs.com"
SEARCH_URL = f"{BASE}/database/search"

DISCOGS_MAX_PAGES = 200
PER_PAGE = 50
MAX_ITEMS = 10_000
DEBUG_SAMPLE_LIMIT = 12

DETAILS_CACHE: Dict[str, dict] = {}
VERSIONS_CACHE: Dict[int, int] = {}

client: Optional[httpx.AsyncClient] = None


def get_http_client() -> httpx.AsyncClient:
    global client
    if client is None:
        raise HTTPException(status_code=500, detail="HTTP client no inicializado.")
    return client


def discogs_headers() -> Dict[str, str]:
    token = os.getenv("DISCOGS_TOKEN", "").strip()
    ua = os.getenv("DISCOGS_USER_AGENT", "103Finder/1.0 (local)")
    if not token:
        return {"User-Agent": ua, "Authorization": "Discogs token="}
    return {"User-Agent": ua, "Authorization": f"Discogs token={token}"}


class SearchFilters(BaseModel):
    year_start: int = 1995
    year_end: int = 1995

    have_min: int = 0
    have_max: int = 80

    want_min: int = 0
    want_max: int = 0  # 0 = sin límite

    max_versions: int = 2
    countries_selected: List[str] = Field(default_factory=list)

    formats_selected: List[str] = Field(default_factory=list)
    type_selected: str = "Todos"  # Todos/release/master

    genres: List[str] = Field(default_factory=list)
    styles: List[str] = Field(default_factory=list)

    strict_genre: bool = False
    strict_style: bool = False
    sin_anyo: bool = False
    solo_en_venta: bool = False
    precio_minimo: float = 0
    precio_maximo: float = 0
    max_copias_venta: int = 0
    tope_resultados: int = 0

    youtube_status: str = "Todos"  # Todos / Si / No


class CheckoutSessionRequest(BaseModel):
    return_path: str = "/billing"


class PortalSessionRequest(BaseModel):
    return_path: str = "/billing"


app = FastAPI(title="103 FINDER API")


def load_cors_origins() -> List[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if raw:
        return [value.strip() for value in raw.split(",") if value.strip()]
    return [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=load_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    global client
    client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)


@app.on_event("shutdown")
async def shutdown_event():
    global client
    if client:
        await client.aclose()


def get_env(name: str, default: Optional[str] = None) -> str:
    value = os.getenv(name, default if default is not None else "")
    if value is None or not str(value).strip():
        raise HTTPException(status_code=500, detail=f"Falta la variable de entorno {name}.")
    return str(value).strip()


def get_app_base_url() -> str:
    return get_env("APP_BASE_URL", "http://localhost:3000").rstrip("/")


def get_stripe_price_id() -> str:
    return get_env("STRIPE_PRICE_ID")


def stripe_configured() -> None:
    stripe.api_key = get_env("STRIPE_SECRET_KEY")


def supabase_rest_url(table: str) -> str:
    return f"{get_env('SUPABASE_URL').rstrip('/')}/rest/v1/{table}"


def supabase_auth_user_url() -> str:
    return f"{get_env('SUPABASE_URL').rstrip('/')}/auth/v1/user"


def supabase_service_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    service_role_key = get_env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


async def supabase_select(
    table: str,
    select: str,
    filters: Optional[Dict[str, str]] = None,
    single: bool = False,
) -> Any:
    http_client = get_http_client()
    params: Dict[str, str] = {"select": select}
    if filters:
        params.update(filters)
    response = await http_client.get(supabase_rest_url(table), params=params, headers=supabase_service_headers())
    response.raise_for_status()
    data = response.json()
    if single:
        return data[0] if data else None
    return data


async def supabase_upsert(table: str, payload: Dict[str, Any], on_conflict: str) -> Any:
    http_client = get_http_client()
    response = await http_client.post(
        f"{supabase_rest_url(table)}?on_conflict={on_conflict}",
        headers=supabase_service_headers({"Prefer": "resolution=merge-duplicates,return=representation"}),
        json=payload,
    )
    response.raise_for_status()
    data = response.json()
    return data[0] if isinstance(data, list) and data else data


async def get_authenticated_user(request: Request) -> Dict[str, Any]:
    authorization = request.headers.get("Authorization", "")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Falta Authorization Bearer token.")

    http_client = get_http_client()
    response = await http_client.get(
        supabase_auth_user_url(),
        headers={
            "apikey": get_env("SUPABASE_ANON_KEY"),
            "Authorization": authorization,
        },
    )

    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="Sesion no valida para Stripe.")

    data = response.json()
    if not data.get("id"):
        raise HTTPException(status_code=401, detail="No se pudo validar el usuario.")
    return data


def iso_from_unix(timestamp_value: Optional[int]) -> Optional[str]:
    if not timestamp_value:
        return None
    return datetime.fromtimestamp(int(timestamp_value), tz=timezone.utc).isoformat()


async def resolve_user_subscription(user_id: Optional[str] = None, customer_id: Optional[str] = None, subscription_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    filters: Dict[str, str] = {}
    if user_id:
        filters["user_id"] = f"eq.{user_id}"
    elif customer_id:
        filters["stripe_customer_id"] = f"eq.{customer_id}"
    elif subscription_id:
        filters["stripe_subscription_id"] = f"eq.{subscription_id}"
    else:
        return None

    return await supabase_select(
        "user_subscriptions",
        "user_id,stripe_customer_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end",
        filters,
        single=True,
    )


async def sync_subscription_record(user_id: str, subscription: Any, customer_id: Optional[str] = None) -> None:
    item_list = subscription.get("items", {}).get("data", []) if isinstance(subscription, dict) else subscription["items"]["data"]
    price_id = item_list[0]["price"]["id"] if item_list else None
    await supabase_upsert(
        "user_subscriptions",
        {
            "user_id": user_id,
            "stripe_customer_id": str(customer_id or subscription.get("customer")),
            "stripe_subscription_id": str(subscription.get("id")),
            "stripe_price_id": price_id,
            "status": str(subscription.get("status", "inactive")),
            "current_period_end": iso_from_unix(subscription.get("current_period_end")),
            "cancel_at_period_end": bool(subscription.get("cancel_at_period_end", False)),
        },
        "user_id",
    )


def _sleep_for_rate(resp: httpx.Response):
    try:
        remaining = int(resp.headers.get("X-Discogs-Ratelimit-Remaining", "60"))
    except Exception:
        remaining = 60
    if remaining <= 1:
        time.sleep(1.2)


async def discogs_get(url: str, params: Optional[dict] = None, timeout: int = 30) -> dict:
    token = os.getenv("DISCOGS_TOKEN", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Falta DISCOGS_TOKEN en variables de entorno.")

    http_client = get_http_client()
    headers = discogs_headers()
    backoff = 1.0
    last_exc: Optional[Exception] = None

    for _ in range(6):
        try:
            r = await http_client.get(url, headers=headers, params=params, timeout=timeout)

            if r.status_code == 401:
                raise HTTPException(status_code=400, detail="Token de Discogs inválido o no autorizado (401).")

            if r.status_code in (429, 500, 502, 503, 504):
                await asyncio.sleep(backoff)
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
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 20)

    raise HTTPException(status_code=400, detail=str(last_exc or "Fallo desconocido"))


async def get_cached(url: str) -> dict:
    if url in DETAILS_CACHE:
        return DETAILS_CACHE[url]
    data = await discogs_get(url, params=None)
    if len(DETAILS_CACHE) < 30_000:
        DETAILS_CACHE[url] = data
    return data


async def get_versions_count_cached(master_id: int) -> int:
    if master_id in VERSIONS_CACHE:
        return VERSIONS_CACHE[master_id]
    url = f"{BASE}/masters/{master_id}/versions"
    data = await discogs_get(url, params={"per_page": 1, "page": 1})
    n = int(data.get("pagination", {}).get("items", 0))
    if len(VERSIONS_CACHE) < 50_000:
        VERSIONS_CACHE[master_id] = n
    return n


def build_params(f: SearchFilters) -> Dict[str, Any]:
    params: Dict[str, Any] = {
        "per_page": PER_PAGE,
        "page": 1,
        "sort": "title",
        "sort_order": "asc",
    }

    if not f.sin_anyo:
        params["year"] = str(f.year_start) if f.year_start == f.year_end else f"{f.year_start}-{f.year_end}"

    if f.type_selected != "Todos":
        params["type"] = f.type_selected

    if len(f.countries_selected) == 1:
        params["country"] = f.countries_selected[0]

    base_formats = {"vinyl", "cd", "cassette", "file", "cdr", "dvd", "box set", "all media"}
    base_selected = [x for x in f.formats_selected if str(x).strip().lower() in base_formats]
    if base_selected and f.type_selected != "master":
        params["format"] = base_selected

    if f.genres:
        params["genre"] = f.genres
    if f.styles:
        params["style"] = f.styles

    return params


def extract_have(details: dict) -> int:
    comm = details.get("community") or {}
    have = comm.get("have", None)
    if have is None:
        return 0
    try:
        return int(have)
    except Exception:
        return 0


def extract_want(details: dict) -> int:
    comm = details.get("community") or {}
    want = comm.get("want", None)
    if want is None:
        return 0
    try:
        return int(want)
    except Exception:
        return 0


def extract_has_youtube(details: dict) -> bool:
    videos = details.get("videos") or []
    return isinstance(videos, list) and len(videos) > 0


def _norm_set(values: List[str]) -> set:
    return {str(x).strip().lower() for x in values if str(x).strip()}


def extract_formats(details: dict) -> set:
    out = set()
    for fmt in details.get("formats") or []:
        name = fmt.get("name")
        if name:
            out.add(str(name).strip().lower())

        for d in fmt.get("descriptions") or []:
            if d:
                out.add(str(d).strip().lower())

        text = fmt.get("text")
        if text:
            out.add(str(text).strip().lower())

    return out


def build_debug_payload(item: dict, details: dict, reason: str) -> dict:
    return {
        "reason": reason,
        "title": details.get("title") or item.get("title") or "",
        "styles": details.get("styles") or [],
        "genres": details.get("genres") or [],
    }


def get_rejection_reason(details: dict, f: SearchFilters) -> Optional[str]:
    have = extract_have(details)
    if have < int(f.have_min):
        return "have_below_min"
    if int(f.have_max) > 0 and have > int(f.have_max):
        return "have_above_max"

    want = extract_want(details)
    if want < int(f.want_min):
        return "want_below_min"
    if int(f.want_max) > 0 and want > int(f.want_max):
        return "want_above_max"

    year = details.get("year", None)
    if f.sin_anyo:
        if year not in (None, 0):
            return "year_present_but_sin_anyo"
    else:
        if year in (None, 0):
            return "year_missing"
        if not (f.year_start <= int(year) <= f.year_end):
            return "year_out_of_range"

    rel_genres = details.get("genres") or []
    rel_styles = details.get("styles") or []

    rel_genres_set = _norm_set(rel_genres)
    rel_styles_set = _norm_set(rel_styles)

    if f.genres and not rel_genres_set:
        return "genres_missing"
    if f.styles and not rel_styles_set:
        return "styles_missing"

    req_genres = _norm_set(f.genres)
    req_styles = _norm_set(f.styles)

    if req_genres and not req_genres.issubset(rel_genres_set):
        return "genres_not_matched"
    if req_styles and not req_styles.issubset(rel_styles_set):
        return "styles_not_matched"

    if f.strict_genre and req_genres and rel_genres_set != req_genres:
        return "strict_genre_failed"
    if f.strict_style and req_styles and rel_styles_set != req_styles:
        return "strict_style_failed"

    if f.formats_selected:
        req_formats = _norm_set(f.formats_selected)
        rel_formats = extract_formats(details)
        if not req_formats.intersection(rel_formats):
            return "formats_not_matched"

    if f.countries_selected:
        req_countries = _norm_set(f.countries_selected)
        rel_country = str(details.get("country") or "").strip().lower()
        if rel_country not in req_countries:
            return "country_not_matched"

    has_youtube = extract_has_youtube(details)
    if f.youtube_status == "Si" and not has_youtube:
        return "youtube_required"
    if f.youtube_status == "No" and has_youtube:
        return "youtube_forbidden"

    if f.solo_en_venta and int(details.get("num_for_sale", 0) or 0) <= 0:
        return "not_for_sale"

    lp = details.get("lowest_price", None)
    if f.precio_minimo or f.precio_maximo:
        if not isinstance(lp, (int, float)):
            return "price_missing"
        price_value = float(lp)
    else:
        price_value = None

    if f.precio_minimo and price_value is not None and price_value < float(f.precio_minimo):
        return "price_below_min"

    if f.precio_maximo and price_value is not None and price_value > float(f.precio_maximo):
        return "price_above_max"

    if f.max_copias_venta and int(details.get("num_for_sale", 0) or 0) > int(f.max_copias_venta):
        return "too_many_copies_for_sale"

    return None


def passes_details(details: dict, f: SearchFilters) -> bool:
    return get_rejection_reason(details, f) is None


def build_card(item: dict, details: dict) -> dict:
    format_values = sorted(list(extract_formats(details)))
    return {
        "title": details.get("title") or item.get("title"),
        "artist": details.get("artists_sort") or item.get("artist"),
        "year": details.get("year") or item.get("year"),
        "have": extract_have(details),
        "want": extract_want(details),
        "genres": details.get("genres") or [],
        "styles": details.get("styles") or [],
        "formats": format_values,
        "country": details.get("country") or "",
        "has_youtube": extract_has_youtube(details),
        "num_for_sale": int(details.get("num_for_sale", item.get("num_for_sale", 0)) or 0),
        "lowest_price": details.get("lowest_price", item.get("lowest_price", None)),
        "uri": details.get("uri") or item.get("uri"),
        "thumb": item.get("thumb", ""),
    }


@app.get("/")
def root():
    return {"status": "ok", "message": "103 FINDER API running", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    token_ok = bool(os.getenv("DISCOGS_TOKEN", "").strip())
    catalog_db_ok = bool(os.getenv("CATALOG_DATABASE_URL", "").strip() or os.getenv("DATABASE_URL", "").strip())
    return {
        "ok": True,
        "discogs_token_loaded": token_ok,
        "catalog_database_configured": catalog_db_ok,
        "per_page": PER_PAGE,
        "max_pages": DISCOGS_MAX_PAGES,
        "max_items": MAX_ITEMS,
    }


@app.post("/billing/create-checkout-session")
async def create_checkout_session(payload: CheckoutSessionRequest, request: Request):
    user = await get_authenticated_user(request)
    stripe_configured()

    user_id = str(user["id"])
    user_email = str(user.get("email") or "").strip()
    existing_subscription = await resolve_user_subscription(user_id=user_id)
    customer_id = existing_subscription.get("stripe_customer_id") if existing_subscription else None

    if customer_id:
        customer = stripe.Customer.modify(customer_id, email=user_email or None, metadata={"supabase_user_id": user_id})
    else:
        customer = stripe.Customer.create(email=user_email or None, metadata={"supabase_user_id": user_id})
        await supabase_upsert(
            "user_subscriptions",
            {
                "user_id": user_id,
                "stripe_customer_id": customer["id"],
                "status": existing_subscription.get("status", "inactive") if existing_subscription else "inactive",
                "current_period_end": existing_subscription.get("current_period_end") if existing_subscription else None,
                "cancel_at_period_end": existing_subscription.get("cancel_at_period_end", False) if existing_subscription else False,
            },
            "user_id",
        )

    checkout_session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer["id"],
        client_reference_id=user_id,
        line_items=[{"price": get_stripe_price_id(), "quantity": 1}],
        allow_promotion_codes=True,
        success_url=f"{get_app_base_url()}{payload.return_path}?checkout=success",
        cancel_url=f"{get_app_base_url()}{payload.return_path}?checkout=cancelled",
        metadata={"supabase_user_id": user_id},
        subscription_data={"metadata": {"supabase_user_id": user_id}},
    )

    return {"url": checkout_session.get("url")}


@app.post("/billing/create-portal-session")
async def create_portal_session(payload: PortalSessionRequest, request: Request):
    user = await get_authenticated_user(request)
    stripe_configured()

    existing_subscription = await resolve_user_subscription(user_id=str(user["id"]))
    if not existing_subscription or not existing_subscription.get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="No existe cliente de Stripe para este usuario.")

    portal_session = stripe.billing_portal.Session.create(
        customer=existing_subscription["stripe_customer_id"],
        return_url=f"{get_app_base_url()}{payload.return_path}",
    )

    return {"url": portal_session.get("url")}


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    stripe_configured()

    payload = await request.body()
    signature = request.headers.get("Stripe-Signature", "")

    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=signature, secret=get_env("STRIPE_WEBHOOK_SECRET"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Webhook Stripe invalido: {exc}")

    event_type = event.get("type")
    obj = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        user_id = obj.get("metadata", {}).get("supabase_user_id") or obj.get("client_reference_id")
        subscription_id = obj.get("subscription")
        if user_id and subscription_id:
            subscription = stripe.Subscription.retrieve(subscription_id)
            await sync_subscription_record(str(user_id), subscription, customer_id=str(obj.get("customer")))

    elif event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
        user_id = obj.get("metadata", {}).get("supabase_user_id")
        if not user_id:
            existing_subscription = await resolve_user_subscription(
                customer_id=str(obj.get("customer")) if obj.get("customer") else None,
                subscription_id=str(obj.get("id")) if obj.get("id") else None,
            )
            user_id = existing_subscription.get("user_id") if existing_subscription else None

        if user_id:
            await sync_subscription_record(str(user_id), obj, customer_id=str(obj.get("customer")))

    return {"received": True}


@app.post("/search/stream")
async def search_stream(filters: SearchFilters):
    if not os.getenv("DISCOGS_TOKEN", "").strip():
        raise HTTPException(status_code=400, detail="Falta DISCOGS_TOKEN en variables de entorno.")

    params = build_params(filters)

    first = await discogs_get(SEARCH_URL, params=params)
    total_pages = int(first.get("pagination", {}).get("pages", 1))

    max_pages_by_items = math.ceil(MAX_ITEMS / PER_PAGE)
    total_pages = min(total_pages, DISCOGS_MAX_PAGES, max_pages_by_items)

    async def gen():
        found = 0
        processed = 0
        debug_sent = 0

        def send(event: str, payload: dict):
            return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

        yield send("status", {"page": 1, "total_pages": total_pages, "found": 0, "processed": 0})

        for page in range(1, total_pages + 1):
            params["page"] = page

            try:
                data = await discogs_get(SEARCH_URL, params=params)
                items = data.get("results", []) or []
            except Exception:
                yield send("status", {"page": page, "total_pages": total_pages, "found": found, "processed": processed})
                continue

            for item in items:
                processed += 1
                if processed >= MAX_ITEMS:
                    yield send("done", {"found": found, "processed": processed, "reason": "max_items"})
                    return

                resource_url = item.get("resource_url")
                if not resource_url:
                    continue

                try:
                    details = await get_cached(resource_url)
                except Exception:
                    continue

                if (details.get("community") is None) or (
                    details.get("styles") is None and details.get("genres") is None
                ):
                    main_rel = details.get("main_release")
                    if main_rel:
                        try:
                            details = await get_cached(f"{BASE}/releases/{int(main_rel)}")
                        except Exception:
                            continue

                rejection_reason = get_rejection_reason(details, filters)
                if rejection_reason is not None:
                    if debug_sent < DEBUG_SAMPLE_LIMIT:
                        debug_sent += 1
                        yield send("debug", build_debug_payload(item, details, rejection_reason))
                    continue

                master_id = details.get("master_id")
                if master_id and filters.max_versions:
                    try:
                        if await get_versions_count_cached(int(master_id)) > int(filters.max_versions):
                            continue
                    except Exception:
                        pass

                card = build_card(item, details)

                found += 1
                yield send("item", {"idx": found, "card": card})

                if filters.tope_resultados and found >= int(filters.tope_resultados):
                    yield send("done", {"found": found, "processed": processed, "reason": "tope_resultados"})
                    return

            yield send("status", {"page": page, "total_pages": total_pages, "found": found, "processed": processed})

        yield send("done", {"found": found, "processed": processed, "reason": "end_pages"})

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/catalog/search")
async def catalog_search(filters: SearchFilters, mode: str = "catalog-local"):
    backend = parse_catalog_search_mode(mode)
    return await collect_catalog_search(filters, backend, discogs_get)


@app.post("/catalog/search/stream")
async def catalog_search_stream(filters: SearchFilters, mode: str = "catalog-local"):
    backend = parse_catalog_search_mode(mode)

    async def gen():
        def send(event: str, payload: dict):
            return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

        async for event, payload in stream_catalog_search(filters, backend, discogs_get):
            yield send(event, payload)

    return StreamingResponse(gen(), media_type="text/event-stream")

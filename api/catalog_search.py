import os
from typing import Any, AsyncIterator, Awaitable, Callable, Optional, Protocol

import asyncpg
from fastapi import HTTPException

CATALOG_BATCH_SIZE = 250
CATALOG_BACKENDS = {"catalog-local", "catalog-hybrid"}


class SearchFiltersLike(Protocol):
    year_start: int
    year_end: int
    have_min: int
    have_max: int
    want_min: int
    want_max: int
    max_versions: int
    countries_selected: list[str]
    formats_selected: list[str]
    type_selected: str
    genres: list[str]
    styles: list[str]
    strict_genre: bool
    strict_style: bool
    sin_anyo: bool
    solo_en_venta: bool
    precio_minimo: float
    precio_maximo: float
    max_copias_venta: int
    tope_resultados: int
    youtube_status: str
    not_on_label_only: bool
    exclude_various: bool


DiscogsGetFn = Callable[[str, Optional[dict[str, Any]], int], Awaitable[dict[str, Any]]]


def parse_catalog_search_mode(mode: str) -> str:
    normalized = (mode or "catalog-local").strip().lower()
    if normalized not in CATALOG_BACKENDS:
        raise HTTPException(status_code=400, detail="Modo de catalogo invalido.")
    return normalized


def catalog_database_url() -> str:
    candidates = [
        os.getenv("CATALOG_DATABASE_URL", "").strip(),
        os.getenv("DATABASE_URL", "").strip(),
    ]
    for value in candidates:
        if value:
            return value
    raise HTTPException(status_code=500, detail="Falta CATALOG_DATABASE_URL para acceder a discogs_catalog.")


async def open_catalog_connection() -> asyncpg.Connection:
    try:
        return await asyncpg.connect(catalog_database_url(), timeout=15)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo conectar con discogs_catalog: {exc}") from exc


def sql_quote(value: str) -> str:
    return "'{}'".format(value.strip().lower().replace("'", "''"))


def normalized_sql_values(values: list[str]) -> list[str]:
    normalized = sorted({value.strip().lower() for value in values if value and value.strip()})
    return [sql_quote(value) for value in normalized]


def sql_list(values: list[str]) -> str:
    return ", ".join(normalized_sql_values(values))


def summarize_catalog_filters(filters: SearchFiltersLike) -> str:
    countries = "/".join(filters.countries_selected) if filters.countries_selected else "todos"
    formats = "/".join(filters.formats_selected) if filters.formats_selected else "todos"
    genres = "/".join(filters.genres) if filters.genres else "todos"
    styles = "/".join(filters.styles) if filters.styles else "todos"
    return (
        f"year={filters.year_start}..{filters.year_end} sin_anyo={filters.sin_anyo} "
        f"type={filters.type_selected} countries={countries} formats={formats} "
        f"genres={genres} styles={styles} strict_genre={filters.strict_genre} "
        f"strict_style={filters.strict_style} have={filters.have_min}..{filters.have_max} "
        f"want={filters.want_min}..{filters.want_max} youtube={filters.youtube_status} "
        f"not_on_label={filters.not_on_label_only} exclude_various={filters.exclude_various}"
    )


def format_catalog_error(context: str, exc: Exception, filters: Optional[SearchFiltersLike] = None) -> str:
    detail = getattr(exc, "detail", None)
    message = str(detail or exc)
    if filters is None:
        return f"{context}: {message}"
    return f"{context}: {message} | filtros: {summarize_catalog_filters(filters)}"


def build_catalog_search_query(
    filters: SearchFiltersLike,
    include_snapshot_filters: bool,
    limit: Optional[int],
    offset: int,
    include_aggregates: bool,
) -> str:
    where_clauses = ["TRUE"]
    effective_year_expr = (
        "CASE WHEN r.year IS NOT NULL AND r.year <> 0 THEN r.year "
        "WHEN COALESCE(r.released, '') ~ '^[0-9]{4}' THEN SUBSTRING(r.released FROM 1 FOR 4)::integer "
        "ELSE NULL END"
    )

    if filters.type_selected.lower() == "master":
        where_clauses.append("r.master_id IS NOT NULL")

    if filters.sin_anyo:
        where_clauses.append(f"({effective_year_expr}) IS NULL")
    else:
        where_clauses.append(f"({effective_year_expr}) BETWEEN {filters.year_start} AND {filters.year_end}")

    if include_snapshot_filters:
        where_clauses.append(f"COALESCE(r.have, 0) >= {filters.have_min}")
        if filters.have_max > 0:
            where_clauses.append(f"COALESCE(r.have, 0) <= {filters.have_max}")

        where_clauses.append(f"COALESCE(r.want, 0) >= {filters.want_min}")
        if filters.want_max > 0:
            where_clauses.append(f"COALESCE(r.want, 0) <= {filters.want_max}")

    if filters.countries_selected:
        where_clauses.append(f"LOWER(COALESCE(r.country, '')) IN ({sql_list(filters.countries_selected)})")

    if include_snapshot_filters:
        if filters.solo_en_venta:
            where_clauses.append("COALESCE(r.num_for_sale, 0) > 0")
        if filters.max_copias_venta > 0:
            where_clauses.append(f"COALESCE(r.num_for_sale, 0) <= {filters.max_copias_venta}")
        if filters.precio_minimo > 0.0:
            where_clauses.append(
                f"r.lowest_price IS NOT NULL AND r.lowest_price >= {filters.precio_minimo}"
            )
        if filters.precio_maximo > 0.0:
            where_clauses.append(
                f"r.lowest_price IS NOT NULL AND r.lowest_price <= {filters.precio_maximo}"
            )

    if filters.max_versions > 0:
        where_clauses.append(
            "COALESCE(mvc.version_count, CASE WHEN r.master_id IS NULL THEN 1 ELSE NULL END, 1) "
            f"<= {filters.max_versions}"
        )

    if filters.not_on_label_only:
        where_clauses.append(
            "EXISTS (SELECT 1 FROM catalog.release_labels rl "
            "WHERE rl.release_id = r.release_id AND LOWER(rl.label_name) LIKE 'not on label%')"
        )

    if filters.exclude_various:
        where_clauses.append(
            "NOT (LOWER(COALESCE(r.artists_sort, '')) = 'various' "
            "OR EXISTS (SELECT 1 FROM catalog.release_artists ra "
            "WHERE ra.release_id = r.release_id AND LOWER(ra.artist_name) = 'various'))"
        )

    if include_snapshot_filters:
        if filters.youtube_status == "Si":
            where_clauses.append(
                "EXISTS (SELECT 1 FROM catalog.release_videos rv WHERE rv.release_id = r.release_id)"
            )
        elif filters.youtube_status == "No":
            where_clauses.append(
                "NOT EXISTS (SELECT 1 FROM catalog.release_videos rv WHERE rv.release_id = r.release_id)"
            )

    for genre in normalized_sql_values(filters.genres):
        where_clauses.append(
            f"EXISTS (SELECT 1 FROM catalog.release_genres rg WHERE rg.release_id = r.release_id AND LOWER(rg.genre) = {genre})"
        )
    if filters.strict_genre and filters.genres:
        where_clauses.append(
            "(SELECT COUNT(DISTINCT LOWER(rg.genre)) FROM catalog.release_genres rg "
            f"WHERE rg.release_id = r.release_id) = {len(normalized_sql_values(filters.genres))}"
        )

    for style in normalized_sql_values(filters.styles):
        where_clauses.append(
            f"EXISTS (SELECT 1 FROM catalog.release_styles rs WHERE rs.release_id = r.release_id AND LOWER(rs.style) = {style})"
        )
    if filters.strict_style and filters.styles:
        where_clauses.append(
            "(SELECT COUNT(DISTINCT LOWER(rs.style)) FROM catalog.release_styles rs "
            f"WHERE rs.release_id = r.release_id) = {len(normalized_sql_values(filters.styles))}"
        )

    format_values = normalized_sql_values(filters.formats_selected)
    if format_values:
        where_clauses.append(
            "EXISTS (SELECT 1 FROM ("
            "SELECT LOWER(rf.format_name) AS value FROM catalog.release_formats rf WHERE rf.release_id = r.release_id "
            "UNION SELECT LOWER(rfd.description) AS value FROM catalog.release_format_descriptions rfd WHERE rfd.release_id = r.release_id "
            "UNION SELECT LOWER(rf.format_text) AS value FROM catalog.release_formats rf WHERE rf.release_id = r.release_id AND rf.format_text IS NOT NULL"
            f") format_values WHERE format_values.value IN ({', '.join(format_values)}))"
        )

    select_genres = (
        "COALESCE((SELECT ARRAY_AGG(DISTINCT rg.genre ORDER BY rg.genre) FROM catalog.release_genres rg "
        "WHERE rg.release_id = r.release_id), ARRAY[]::TEXT[]) AS genres,"
        if include_aggregates
        else "ARRAY[]::TEXT[] AS genres,"
    )
    select_styles = (
        "COALESCE((SELECT ARRAY_AGG(DISTINCT rs.style ORDER BY rs.style) FROM catalog.release_styles rs "
        "WHERE rs.release_id = r.release_id), ARRAY[]::TEXT[]) AS styles,"
        if include_aggregates
        else "ARRAY[]::TEXT[] AS styles,"
    )
    select_formats = (
        "COALESCE((SELECT ARRAY_AGG(DISTINCT format_value ORDER BY format_value) FROM ("
        "SELECT rf.format_name AS format_value FROM catalog.release_formats rf WHERE rf.release_id = r.release_id "
        "UNION SELECT rfd.description AS format_value FROM catalog.release_format_descriptions rfd WHERE rfd.release_id = r.release_id "
        "UNION SELECT rf.format_text AS format_value FROM catalog.release_formats rf WHERE rf.release_id = r.release_id AND rf.format_text IS NOT NULL"
        ") all_formats), ARRAY[]::TEXT[]) AS formats,"
        if include_aggregates
        else "ARRAY[]::TEXT[] AS formats,"
    )

    base_query = f"""
        WITH filtered AS (
            SELECT
                r.release_id,
                r.master_id,
                r.title,
                r.artists_sort,
                {effective_year_expr} AS year,
                r.country,
                r.thumb,
                r.uri,
                r.have,
                r.want,
                r.num_for_sale,
                CASE WHEN r.lowest_price IS NULL THEN NULL ELSE r.lowest_price::double precision END AS lowest_price,
                COALESCE(mvc.version_count, CASE WHEN r.master_id IS NULL THEN 1 ELSE NULL END, 1) AS version_count,
                EXISTS (SELECT 1 FROM catalog.release_videos rv WHERE rv.release_id = r.release_id) AS has_youtube,
                {select_genres}
                {select_styles}
                {select_formats}
                ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(r.master_id, -r.release_id)
                    ORDER BY CASE WHEN m.main_release_id = r.release_id THEN 0 ELSE 1 END,
                             ({effective_year_expr}) NULLS LAST,
                             r.release_id
                ) AS master_rank
            FROM catalog.releases r
            LEFT JOIN catalog.masters m ON m.master_id = r.master_id
            LEFT JOIN catalog.master_version_counts mvc ON mvc.master_id = r.master_id
            WHERE {' AND '.join(where_clauses)}
        )
        SELECT
            release_id, master_id, title, artists_sort, year, country, thumb, uri,
            have, want, num_for_sale, lowest_price, version_count, has_youtube,
            genres, styles, formats
        FROM filtered
        WHERE {'master_rank = 1' if filters.type_selected.lower() == 'master' else 'TRUE'}
        ORDER BY year NULLS LAST, release_id
    """.strip()

    effective_limit = limit if limit is not None else (min(filters.tope_resultados, 10000) if filters.tope_resultados > 0 else 10000)
    return f"{base_query} LIMIT {effective_limit} OFFSET {offset}"


def build_catalog_card(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "title": row["title"],
        "artist": row["artists_sort"] or "",
        "year": row["year"],
        "have": row["have"],
        "want": row["want"],
        "genres": list(row["genres"] or []),
        "styles": list(row["styles"] or []),
        "formats": list(row["formats"] or []),
        "country": row["country"] or "",
        "has_youtube": bool(row["has_youtube"]),
        "num_for_sale": row["num_for_sale"] or 0,
        "lowest_price": row["lowest_price"],
        "uri": row["uri"] or "",
        "thumb": row["thumb"] or "",
    }


def _norm_set(values: list[str]) -> set[str]:
    return {str(value).strip().lower() for value in values if str(value).strip()}


def extract_have(details: dict[str, Any]) -> int:
    community = details.get("community") or {}
    try:
        return int(community.get("have") or 0)
    except Exception:
        return 0


def extract_want(details: dict[str, Any]) -> int:
    community = details.get("community") or {}
    try:
        return int(community.get("want") or 0)
    except Exception:
        return 0


def extract_has_youtube(details: dict[str, Any]) -> bool:
    videos = details.get("videos") or []
    return isinstance(videos, list) and len(videos) > 0


def extract_formats(details: dict[str, Any]) -> set[str]:
    values: set[str] = set()
    for fmt in details.get("formats") or []:
        name = fmt.get("name")
        if name:
            values.add(str(name).strip().lower())
        for description in fmt.get("descriptions") or []:
            if description:
                values.add(str(description).strip().lower())
        text = fmt.get("text")
        if text:
            values.add(str(text).strip().lower())
    return values


def passes_details(details: dict[str, Any], filters: SearchFiltersLike) -> bool:
    have = extract_have(details)
    if have < int(filters.have_min):
        return False
    if int(filters.have_max) > 0 and have > int(filters.have_max):
        return False

    want = extract_want(details)
    if want < int(filters.want_min):
        return False
    if int(filters.want_max) > 0 and want > int(filters.want_max):
        return False

    year = details.get("year")
    if filters.sin_anyo:
        if year not in (None, 0):
            return False
    else:
        if year in (None, 0):
            return False
        if not (filters.year_start <= int(year) <= filters.year_end):
            return False

    requested_genres = _norm_set(filters.genres)
    requested_styles = _norm_set(filters.styles)
    release_genres = _norm_set(details.get("genres") or [])
    release_styles = _norm_set(details.get("styles") or [])

    if requested_genres and not requested_genres.issubset(release_genres):
        return False
    if requested_styles and not requested_styles.issubset(release_styles):
        return False
    if filters.strict_genre and requested_genres and release_genres != requested_genres:
        return False
    if filters.strict_style and requested_styles and release_styles != requested_styles:
        return False

    if filters.formats_selected:
        if not _norm_set(filters.formats_selected).intersection(extract_formats(details)):
            return False

    if filters.countries_selected:
        release_country = str(details.get("country") or "").strip().lower()
        if release_country not in _norm_set(filters.countries_selected):
            return False

    has_youtube = extract_has_youtube(details)
    if filters.youtube_status == "Si" and not has_youtube:
        return False
    if filters.youtube_status == "No" and has_youtube:
        return False

    num_for_sale = int(details.get("num_for_sale", 0) or 0)
    if filters.solo_en_venta and num_for_sale <= 0:
        return False
    if filters.max_copias_venta and num_for_sale > int(filters.max_copias_venta):
        return False

    lowest_price = details.get("lowest_price")
    if filters.precio_minimo or filters.precio_maximo:
        if not isinstance(lowest_price, (int, float)):
            return False
        if filters.precio_minimo and float(lowest_price) < float(filters.precio_minimo):
            return False
        if filters.precio_maximo and float(lowest_price) > float(filters.precio_maximo):
            return False

    return True


def build_hybrid_card(row: asyncpg.Record, details: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": details.get("title") or row["title"],
        "artist": details.get("artists_sort") or row["artists_sort"] or "",
        "year": details.get("year") or row["year"],
        "have": extract_have(details),
        "want": extract_want(details),
        "genres": details.get("genres") or [],
        "styles": details.get("styles") or [],
        "formats": sorted(extract_formats(details)),
        "country": details.get("country") or row["country"] or "",
        "has_youtube": extract_has_youtube(details),
        "num_for_sale": int(details.get("num_for_sale", row["num_for_sale"] or 0) or 0),
        "lowest_price": details.get("lowest_price", row["lowest_price"]),
        "uri": details.get("uri") or row["uri"] or "",
        "thumb": row["thumb"] or "",
    }


async def stream_catalog_search(
    filters: SearchFiltersLike,
    mode: str,
    discogs_get: DiscogsGetFn,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    yield (
        "status",
        {"message": "Conectando con discogs_catalog...", "page": 0, "total_pages": 1, "found": 0, "processed": 0},
    )

    try:
        connection = await open_catalog_connection()
    except Exception as exc:
        yield ("done", {"reason": "error", "message": format_catalog_error("No se pudo abrir la conexion del catalogo", exc)})
        return

    try:
        if mode == "catalog-hybrid":
            async for event, payload in _stream_hybrid_search(connection, filters, discogs_get):
                yield event, payload
        else:
            async for event, payload in _stream_local_catalog_search(connection, filters):
                yield event, payload
    except Exception as exc:
        yield (
            "done",
            {"reason": "error", "message": format_catalog_error("La busqueda del catalogo fallo", exc, filters)},
        )
    finally:
        await connection.close()


async def collect_catalog_search(filters: SearchFiltersLike, mode: str, discogs_get: DiscogsGetFn) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    final_payload: dict[str, Any] = {"found": 0, "processed": 0, "reason": "empty"}
    async for event, payload in stream_catalog_search(filters, mode, discogs_get):
        if event == "item" and payload.get("card"):
            items.append(payload["card"])
        elif event == "done":
            final_payload = payload
    final_payload["items"] = items
    return final_payload


async def _stream_local_catalog_search(
    connection: asyncpg.Connection,
    filters: SearchFiltersLike,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    yield (
        "status",
        {
            "message": "Ejecutando filtros estructurales sobre discogs_catalog...",
            "page": 0,
            "total_pages": 1,
            "found": 0,
            "processed": 0,
        },
    )

    offset = 0
    found = 0
    processed = 0

    while True:
        query = build_catalog_search_query(filters, True, CATALOG_BATCH_SIZE, offset, True)
        rows = await connection.fetch(query)
        if not rows:
            break

        for row in rows:
            processed += 1
            found += 1
            yield ("item", {"idx": found, "card": build_catalog_card(row)})
            yield (
                "status",
                {
                    "page": (offset // CATALOG_BATCH_SIZE) + 1,
                    "total_pages": 0,
                    "found": found,
                    "processed": processed,
                    "message": f"Catalogo local · lote {(offset // CATALOG_BATCH_SIZE) + 1} · encontrados {found}",
                },
            )

            if filters.tope_resultados > 0 and found >= filters.tope_resultados:
                yield ("done", {"found": found, "processed": processed, "reason": "tope_resultados"})
                return

        if len(rows) < CATALOG_BATCH_SIZE:
            break
        offset += CATALOG_BATCH_SIZE

    yield ("done", {"found": found, "processed": processed, "reason": "catalog_complete"})


async def _stream_hybrid_search(
    connection: asyncpg.Connection,
    filters: SearchFiltersLike,
    discogs_get: DiscogsGetFn,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    yield (
        "status",
        {
            "message": "Conectando con discogs_catalog para prefiltrar...",
            "page": 0,
            "total_pages": 1,
            "found": 0,
            "processed": 0,
        },
    )

    offset = 0
    found = 0
    processed = 0

    while True:
        query = build_catalog_search_query(filters, False, CATALOG_BATCH_SIZE, offset, False)
        rows = await connection.fetch(query)
        if not rows:
            break

        yield (
            "status",
            {
                "message": f"Catalogo local listo. Lote {(offset // CATALOG_BATCH_SIZE) + 1} recibido; ahora se refrescan detalles live.",
                "page": (offset // CATALOG_BATCH_SIZE) + 1,
                "total_pages": 0,
                "found": found,
                "processed": processed,
            },
        )

        for row in rows:
            processed += 1
            release_id = row["release_id"]
            try:
                details = await discogs_get(f"https://api.discogs.com/releases/{release_id}", None, 30)
            except Exception:
                yield (
                    "status",
                    {
                        "page": (offset // CATALOG_BATCH_SIZE) + 1,
                        "total_pages": 0,
                        "found": found,
                        "processed": processed,
                        "message": f"Hibrido · Discogs no devolvio {release_id}. Se sigue con el resto.",
                    },
                )
                continue

            if not passes_details(details, filters):
                yield (
                    "status",
                    {
                        "page": (offset // CATALOG_BATCH_SIZE) + 1,
                        "total_pages": 0,
                        "found": found,
                        "processed": processed,
                        "message": f"Hibrido · procesados {processed} · encontrados {found}",
                    },
                )
                continue

            found += 1
            yield ("item", {"idx": found, "card": build_hybrid_card(row, details)})
            yield (
                "status",
                {
                    "page": (offset // CATALOG_BATCH_SIZE) + 1,
                    "total_pages": 0,
                    "found": found,
                    "processed": processed,
                    "message": f"Hibrido · procesados {processed} · encontrados {found}",
                },
            )

            if filters.tope_resultados > 0 and found >= filters.tope_resultados:
                yield ("done", {"found": found, "processed": processed, "reason": "tope_resultados"})
                return

        if len(rows) < CATALOG_BATCH_SIZE:
            break
        offset += CATALOG_BATCH_SIZE

    yield ("done", {"found": found, "processed": processed, "reason": "hybrid_complete"})

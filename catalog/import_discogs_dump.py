import argparse
import gzip
import json
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable, Iterator
from xml.etree.ElementTree import Element, fromstring, iterparse, tostring

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb


def local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag


def child_text(element: Element, tag: str, default: str | None = None) -> str | None:
    for child in element:
        if local_name(child.tag) == tag:
            text = (child.text or "").strip()
            return text or default
    return default


def child_int(element: Element, tag: str) -> int | None:
    value = child_text(element, tag)
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def int32_or_none(value: int | None) -> int | None:
    if value is None:
        return None
    if -(2**31) <= value <= (2**31 - 1):
        return value
    return None


def parse_int32(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int32_or_none(int(value))
    except ValueError:
        return None


def element_id(element: Element) -> int:
    attr_value = element.attrib.get("id")
    if attr_value:
        return int(attr_value)
    child_value = child_int(element, "id")
    if child_value is not None:
        return child_value
    raise KeyError("id")


def child_decimal(element: Element, tag: str) -> Decimal | None:
    value = child_text(element, tag)
    if value is None:
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        return None


def child_bool(element: Element, tag: str) -> bool | None:
    value = child_text(element, tag)
    if value is None:
        return None
    return value.lower() in {"true", "1", "yes"}


def child_array(element: Element, parent_tag: str, item_tag: str) -> list[str]:
    for child in element:
        if local_name(child.tag) != parent_tag:
            continue
        values: list[str] = []
        for item in child:
            if local_name(item.tag) == item_tag:
                text = (item.text or "").strip()
                if text:
                    values.append(text)
        return values
    return []


def child_json_list(element: Element, parent_tag: str) -> list[dict[str, Any]]:
    for child in element:
        if local_name(child.tag) == parent_tag:
            return [element_to_dict(item) for item in child]
    return []


def element_to_dict(element: Element) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for key, value in element.attrib.items():
        if value is not None:
            data[key] = value

    text = (element.text or "").strip()
    if text and len(element) == 0:
        data["value"] = text

    grouped: dict[str, list[Any]] = {}
    for child in element:
        key = local_name(child.tag)
        value: Any
        if len(child) == 0 and not child.attrib:
            value = (child.text or "").strip()
        else:
            value = element_to_dict(child)
            child_text_value = (child.text or "").strip()
            if child_text_value and "value" not in value:
                value["value"] = child_text_value
        grouped.setdefault(key, []).append(value)

    for key, values in grouped.items():
        data[key] = values if len(values) > 1 else values[0]
    return data


def parse_date_from_filename(path: Path) -> date | None:
    match = re.search(r"discogs_(\d{8})_", path.name)
    if not match:
        return None
    token = match.group(1)
    return date(int(token[0:4]), int(token[4:6]), int(token[6:8]))


def open_dump(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rb")
    return path.open("rb")


def iter_records(path: Path, record_tag: str) -> Iterator[Element]:
    with open_dump(path) as handle:
        stack: list[Element] = []
        context = iterparse(handle, events=("start", "end"))
        for event, element in context:
            if event == "start":
                stack.append(element)
                continue

            if len(stack) == 2 and local_name(element.tag) == record_tag:
                yield fromstring(tostring(element, encoding="utf-8"))
                element.clear()
            if stack:
                stack.pop()


@dataclass
class ArtistPayload:
    row: tuple[Any, ...]


@dataclass
class LabelPayload:
    row: tuple[Any, ...]


@dataclass
class MasterPayload:
    row: tuple[Any, ...]


@dataclass
class ReleasePayload:
    release_row: tuple[Any, ...]
    genres: list[tuple[Any, ...]]
    styles: list[tuple[Any, ...]]
    formats: list[tuple[Any, ...]]
    format_descriptions: list[tuple[Any, ...]]
    artists: list[tuple[Any, ...]]
    labels: list[tuple[Any, ...]]
    tracklist: list[tuple[Any, ...]]
    identifiers: list[tuple[Any, ...]]
    companies: list[tuple[Any, ...]]
    videos: list[tuple[Any, ...]]


def parse_artist(element: Element) -> ArtistPayload:
    artist_id = element_id(element)
    return ArtistPayload(
        row=(
            artist_id,
            child_text(element, "name", ""),
            child_text(element, "realname"),
            child_text(element, "profile"),
            child_text(element, "data_quality"),
            child_array(element, "urls", "url"),
            child_array(element, "namevariations", "name"),
            Jsonb(child_json_list(element, "aliases")),
            Jsonb(child_json_list(element, "groups")),
            Jsonb(child_json_list(element, "members")),
            Jsonb(child_json_list(element, "images")),
        )
    )


def parse_label(element: Element) -> LabelPayload:
    label_id = element_id(element)
    parent_label = None
    for child in element:
        if local_name(child.tag) == "parentLabel":
            parent_label = child.attrib.get("id")
            break
    return LabelPayload(
        row=(
            label_id,
            child_text(element, "name", ""),
            child_text(element, "contactinfo"),
            child_text(element, "profile"),
            child_text(element, "data_quality"),
            int(parent_label) if parent_label and parent_label.isdigit() else None,
            child_array(element, "urls", "url"),
            Jsonb(child_json_list(element, "sublabels")),
            Jsonb(child_json_list(element, "images")),
        )
    )


def parse_master(element: Element) -> MasterPayload:
    master_id = element_id(element)
    main_release_id = child_int(element, "main_release")
    return MasterPayload(
        row=(
            master_id,
            main_release_id,
            child_text(element, "title", ""),
            child_int(element, "year"),
            child_text(element, "data_quality"),
            Jsonb(child_array(element, "genres", "genre")),
            Jsonb(child_array(element, "styles", "style")),
            Jsonb(child_json_list(element, "artists")),
            Jsonb(child_json_list(element, "videos")),
            Jsonb(child_json_list(element, "images")),
        )
    )


def parse_release(element: Element) -> ReleasePayload:
    release_id = element_id(element)
    master_id = child_int(element, "master_id")
    if master_id == 0:
        master_id = None

    seen_genres: set[str] = set()
    genres: list[tuple[Any, ...]] = []
    for genre in child_array(element, "genres", "genre"):
        if genre not in seen_genres:
            seen_genres.add(genre)
            genres.append((release_id, genre))

    seen_styles: set[str] = set()
    styles: list[tuple[Any, ...]] = []
    for style in child_array(element, "styles", "style"):
        if style not in seen_styles:
            seen_styles.add(style)
            styles.append((release_id, style))

    formats: list[tuple[Any, ...]] = []
    format_descriptions: list[tuple[Any, ...]] = []
    seen_format_names: set[tuple[Any, ...]] = set()
    seen_format_descriptions: set[tuple[Any, ...]] = set()
    for child in element:
        if local_name(child.tag) != "formats":
            continue
        for format_element in child:
            if local_name(format_element.tag) != "format":
                continue
            format_name = format_element.attrib.get("name", "")
            qty = format_element.attrib.get("qty")
            format_text = format_element.attrib.get("text")
            format_row = (release_id, format_name, parse_int32(qty), format_text)
            format_key = (release_id, format_name)
            if format_key not in seen_format_names:
                seen_format_names.add(format_key)
                formats.append(format_row)
            for nested in format_element:
                if local_name(nested.tag) != "descriptions":
                    continue
                for description in nested:
                    if local_name(description.tag) != "description":
                        continue
                    text = (description.text or "").strip()
                    if text:
                        description_row = (release_id, format_name, text)
                        if description_row not in seen_format_descriptions:
                            seen_format_descriptions.add(description_row)
                            format_descriptions.append(description_row)

    artists: list[tuple[Any, ...]] = []
    extraartists_json: list[dict[str, Any]] = []
    for child in element:
        if local_name(child.tag) == "artists":
            for index, artist in enumerate(child, start=1):
                if local_name(artist.tag) != "artist":
                    continue
                artist_id = artist.attrib.get("id")
                artists.append(
                    (
                        release_id,
                        index,
                        int(artist_id) if artist_id and artist_id.isdigit() else None,
                        child_text(artist, "name", ""),
                        child_text(artist, "anv"),
                        child_text(artist, "join"),
                        child_text(artist, "role"),
                        child_text(artist, "tracks"),
                    )
                )
        elif local_name(child.tag) == "extraartists":
            extraartists_json = [element_to_dict(item) for item in child if local_name(item.tag) == "artist"]

    labels: list[tuple[Any, ...]] = []
    for child in element:
        if local_name(child.tag) != "labels":
            continue
        for index, label in enumerate(child, start=1):
            if local_name(label.tag) != "label":
                continue
            label_id = label.attrib.get("id")
            labels.append(
                (
                    release_id,
                    index,
                    int(label_id) if label_id and label_id.isdigit() else None,
                    label.attrib.get("name") or child_text(label, "name", "") or "",
                    label.attrib.get("catno") or child_text(label, "catno"),
                )
            )

    companies: list[tuple[Any, ...]] = []
    companies_json: list[dict[str, Any]] = []
    for child in element:
        if local_name(child.tag) != "companies":
            continue
        for index, company in enumerate(child, start=1):
            if local_name(company.tag) != "company":
                continue
            company_id = company.attrib.get("id")
            row = (
                release_id,
                index,
                int(company_id) if company_id and company_id.isdigit() else None,
                company.attrib.get("name") or child_text(company, "name", "") or "",
                child_int(company, "entity_type"),
                child_text(company, "entity_type_name"),
                child_text(company, "catno"),
                child_text(company, "resource_url"),
            )
            companies.append(row)
            companies_json.append(element_to_dict(company))

    tracklist: list[tuple[Any, ...]] = []
    for child in element:
        if local_name(child.tag) != "tracklist":
            continue
        for index, track in enumerate(child, start=1):
            if local_name(track.tag) != "track":
                continue
            tracklist.append(
                (
                    release_id,
                    index,
                    child_text(track, "position"),
                    child_text(track, "type_"),
                    child_text(track, "title", "") or "",
                    child_text(track, "duration"),
                    Jsonb(child_json_list(track, "artists")),
                    Jsonb(child_json_list(track, "extraartists")),
                )
            )

    identifiers: list[tuple[Any, ...]] = []
    for child in element:
        if local_name(child.tag) != "identifiers":
            continue
        for index, identifier in enumerate(child, start=1):
            if local_name(identifier.tag) != "identifier":
                continue
            identifiers.append(
                (
                    release_id,
                    index,
                    identifier.attrib.get("type") or child_text(identifier, "type", "") or "",
                    identifier.attrib.get("value") or child_text(identifier, "value"),
                    identifier.attrib.get("description") or child_text(identifier, "description"),
                )
            )

    videos: list[tuple[Any, ...]] = []
    videos_json: list[dict[str, Any]] = []
    for child in element:
        if local_name(child.tag) != "videos":
            continue
        for index, video in enumerate(child, start=1):
            if local_name(video.tag) != "video":
                continue
            videos.append(
                (
                    release_id,
                    index,
                    child_text(video, "title"),
                    child_text(video, "description"),
                    child_text(video, "uri", "") or "",
                    child_int(video, "duration"),
                    child_bool(video, "embed"),
                )
            )
            videos_json.append(element_to_dict(video))

    release_row = (
        release_id,
        master_id,
        child_text(element, "title", ""),
        child_text(element, "status"),
        child_int(element, "year"),
        child_text(element, "released"),
        child_text(element, "released_formatted"),
        child_text(element, "country"),
        child_text(element, "notes"),
        child_text(element, "data_quality"),
        child_text(element, "artists_sort"),
        child_int(element, "estimated_weight"),
        child_int(element, "format_quantity"),
        child_text(element, "thumb"),
        child_text(element, "uri"),
        child_decimal(element, "lowest_price"),
        child_int(element, "num_for_sale"),
        child_int(element, "have"),
        child_int(element, "want"),
        Jsonb(element_to_dict(next((c for c in element if local_name(c.tag) == "community"), Element("community")))),
        Jsonb(companies_json),
        Jsonb(extraartists_json),
        Jsonb(child_json_list(element, "images")),
        Jsonb(videos_json),
    )
    return ReleasePayload(release_row, genres, styles, formats, format_descriptions, artists, labels, tracklist, identifiers, companies, videos)


ARTIST_SQL = """
INSERT INTO catalog.artists (
    artist_id, name, real_name, profile, data_quality, urls, name_variations,
    aliases, groups_json, members_json, images_json
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (artist_id) DO UPDATE SET
    name = EXCLUDED.name,
    real_name = EXCLUDED.real_name,
    profile = EXCLUDED.profile,
    data_quality = EXCLUDED.data_quality,
    urls = EXCLUDED.urls,
    name_variations = EXCLUDED.name_variations,
    aliases = EXCLUDED.aliases,
    groups_json = EXCLUDED.groups_json,
    members_json = EXCLUDED.members_json,
    images_json = EXCLUDED.images_json,
    updated_at = NOW()
"""

LABEL_SQL = """
INSERT INTO catalog.labels (
    label_id, name, contact_info, profile, data_quality, parent_label_id, urls,
    sublabels_json, images_json
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (label_id) DO UPDATE SET
    name = EXCLUDED.name,
    contact_info = EXCLUDED.contact_info,
    profile = EXCLUDED.profile,
    data_quality = EXCLUDED.data_quality,
    parent_label_id = EXCLUDED.parent_label_id,
    urls = EXCLUDED.urls,
    sublabels_json = EXCLUDED.sublabels_json,
    images_json = EXCLUDED.images_json,
    updated_at = NOW()
"""

MASTER_SQL = """
INSERT INTO catalog.masters (
    master_id, main_release_id, title, year, data_quality, genres_json, styles_json,
    artists_json, videos_json, images_json
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (master_id) DO UPDATE SET
    main_release_id = EXCLUDED.main_release_id,
    title = EXCLUDED.title,
    year = EXCLUDED.year,
    data_quality = EXCLUDED.data_quality,
    genres_json = EXCLUDED.genres_json,
    styles_json = EXCLUDED.styles_json,
    artists_json = EXCLUDED.artists_json,
    videos_json = EXCLUDED.videos_json,
    images_json = EXCLUDED.images_json,
    updated_at = NOW()
"""

RELEASE_SQL = """
INSERT INTO catalog.releases (
    release_id, master_id, title, status, year, released, released_formatted, country,
    notes, data_quality, artists_sort, estimated_weight, format_quantity, thumb, uri,
    lowest_price, num_for_sale, have, want, community_json, companies_json,
    extraartists_json, images_json, videos_json
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (release_id) DO UPDATE SET
    master_id = EXCLUDED.master_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    year = EXCLUDED.year,
    released = EXCLUDED.released,
    released_formatted = EXCLUDED.released_formatted,
    country = EXCLUDED.country,
    notes = EXCLUDED.notes,
    data_quality = EXCLUDED.data_quality,
    artists_sort = EXCLUDED.artists_sort,
    estimated_weight = EXCLUDED.estimated_weight,
    format_quantity = EXCLUDED.format_quantity,
    thumb = EXCLUDED.thumb,
    uri = EXCLUDED.uri,
    lowest_price = EXCLUDED.lowest_price,
    num_for_sale = EXCLUDED.num_for_sale,
    have = EXCLUDED.have,
    want = EXCLUDED.want,
    community_json = EXCLUDED.community_json,
    companies_json = EXCLUDED.companies_json,
    extraartists_json = EXCLUDED.extraartists_json,
    images_json = EXCLUDED.images_json,
    videos_json = EXCLUDED.videos_json,
    updated_at = NOW()
"""


def chunked(items: Iterable[Any], size: int) -> Iterator[list[Any]]:
    batch: list[Any] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def ensure_import_run(cur: psycopg.Cursor[Any], snapshot_date: date, entity: str, source_file: str) -> int:
    cur.execute(
        """
        INSERT INTO catalog.import_runs (snapshot_date, entity_type, source_file)
        VALUES (%s, %s, %s)
        RETURNING import_run_id
        """,
        (snapshot_date, entity, source_file),
    )
    row = cur.fetchone()
    if row is None:
        raise RuntimeError("No se pudo crear import_run")
    return int(row[0])


def finish_import_run(cur: psycopg.Cursor[Any], import_run_id: int, status: str, rows_loaded: int, notes: str | None = None) -> None:
    cur.execute(
        """
        UPDATE catalog.import_runs
        SET finished_at = NOW(), status = %s, rows_loaded = %s, notes = %s
        WHERE import_run_id = %s
        """,
        (status, rows_loaded, notes, import_run_id),
    )


def truncate_entity(cur: psycopg.Cursor[Any], entity: str) -> None:
    if entity == "artists":
        cur.execute("TRUNCATE TABLE catalog.artists RESTART IDENTITY CASCADE")
    elif entity == "labels":
        cur.execute("TRUNCATE TABLE catalog.labels RESTART IDENTITY CASCADE")
    elif entity == "masters":
        cur.execute("TRUNCATE TABLE catalog.masters RESTART IDENTITY CASCADE")
    elif entity == "releases":
        cur.execute(
            """
            TRUNCATE TABLE
                catalog.release_videos,
                catalog.release_companies,
                catalog.release_identifiers,
                catalog.release_tracklist,
                catalog.release_labels,
                catalog.release_artists,
                catalog.release_format_descriptions,
                catalog.release_formats,
                catalog.release_styles,
                catalog.release_genres,
                catalog.releases
            RESTART IDENTITY CASCADE
            """
        )
    else:
        raise ValueError(f"Entidad no soportada: {entity}")


def import_artists(conn: psycopg.Connection[Any], dump_path: Path, batch_size: int, limit: int | None) -> int:
    rows_loaded = 0
    with conn.cursor() as cur:
        for batch in chunked(iter_records(dump_path, "artist"), batch_size):
            payload = [parse_artist(item).row for item in batch]
            cur.executemany(ARTIST_SQL, payload)
            conn.commit()
            rows_loaded += len(payload)
            print(f"artists: {rows_loaded} cargados")
            if limit and rows_loaded >= limit:
                return limit
    return rows_loaded


def import_labels(conn: psycopg.Connection[Any], dump_path: Path, batch_size: int, limit: int | None) -> int:
    rows_loaded = 0
    with conn.cursor() as cur:
        for batch in chunked(iter_records(dump_path, "label"), batch_size):
            payload = [parse_label(item).row for item in batch]
            cur.executemany(LABEL_SQL, payload)
            conn.commit()
            rows_loaded += len(payload)
            print(f"labels: {rows_loaded} cargados")
            if limit and rows_loaded >= limit:
                return limit
    return rows_loaded


def import_masters(conn: psycopg.Connection[Any], dump_path: Path, batch_size: int, limit: int | None) -> int:
    rows_loaded = 0
    with conn.cursor() as cur:
        for batch in chunked(iter_records(dump_path, "master"), batch_size):
            payload = [parse_master(item).row for item in batch]
            cur.executemany(MASTER_SQL, payload)
            conn.commit()
            rows_loaded += len(payload)
            print(f"masters: {rows_loaded} cargados")
            if limit and rows_loaded >= limit:
                return limit
    return rows_loaded


def delete_release_children(cur: psycopg.Cursor[Any], release_ids: list[int]) -> None:
    table_names = [
        "catalog.release_genres",
        "catalog.release_styles",
        "catalog.release_formats",
        "catalog.release_format_descriptions",
        "catalog.release_artists",
        "catalog.release_labels",
        "catalog.release_tracklist",
        "catalog.release_identifiers",
        "catalog.release_companies",
        "catalog.release_videos",
    ]
    for table_name in table_names:
        schema_name, relation_name = table_name.split(".", 1)
        cur.execute(
            sql.SQL("DELETE FROM {}.{} WHERE release_id = ANY(%s)").format(
                sql.Identifier(schema_name),
                sql.Identifier(relation_name),
            ),
            (release_ids,),
        )


def import_releases(conn: psycopg.Connection[Any], dump_path: Path, batch_size: int, limit: int | None) -> int:
    rows_loaded = 0
    with conn.cursor() as cur:
        for batch in chunked(iter_records(dump_path, "release"), batch_size):
            parsed = [parse_release(item) for item in batch]
            release_ids = [int(item.release_row[0]) for item in parsed]
            cur.executemany(RELEASE_SQL, [item.release_row for item in parsed])
            delete_release_children(cur, release_ids)

            genres = [row for item in parsed for row in item.genres]
            styles = [row for item in parsed for row in item.styles]
            formats = [row for item in parsed for row in item.formats]
            format_descriptions = [row for item in parsed for row in item.format_descriptions]
            artists = [row for item in parsed for row in item.artists]
            labels = [row for item in parsed for row in item.labels]
            tracklist = [row for item in parsed for row in item.tracklist]
            identifiers = [row for item in parsed for row in item.identifiers]
            companies = [row for item in parsed for row in item.companies]
            videos = [row for item in parsed for row in item.videos]

            if genres:
                cur.executemany("INSERT INTO catalog.release_genres (release_id, genre) VALUES (%s, %s)", genres)
            if styles:
                cur.executemany("INSERT INTO catalog.release_styles (release_id, style) VALUES (%s, %s)", styles)
            if formats:
                cur.executemany(
                    "INSERT INTO catalog.release_formats (release_id, format_name, qty, format_text) VALUES (%s, %s, %s, %s)",
                    formats,
                )
            if format_descriptions:
                cur.executemany(
                    "INSERT INTO catalog.release_format_descriptions (release_id, format_name, description) VALUES (%s, %s, %s)",
                    format_descriptions,
                )
            if artists:
                cur.executemany(
                    """
                    INSERT INTO catalog.release_artists (
                        release_id, position, artist_id, artist_name, anv, join_relation, role, tracks
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    artists,
                )
            if labels:
                cur.executemany(
                    "INSERT INTO catalog.release_labels (release_id, position, label_id, label_name, catalog_number) VALUES (%s, %s, %s, %s, %s)",
                    labels,
                )
            if tracklist:
                cur.executemany(
                    """
                    INSERT INTO catalog.release_tracklist (
                        release_id, position, sequence_text, track_type, title, duration, artists_json, extraartists_json
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    tracklist,
                )
            if identifiers:
                cur.executemany(
                    "INSERT INTO catalog.release_identifiers (release_id, position, identifier_type, identifier_value, description) VALUES (%s, %s, %s, %s, %s)",
                    identifiers,
                )
            if companies:
                cur.executemany(
                    """
                    INSERT INTO catalog.release_companies (
                        release_id, position, company_id, company_name, entity_type, entity_type_name, catalog_number, resource_url
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    companies,
                )
            if videos:
                cur.executemany(
                    "INSERT INTO catalog.release_videos (release_id, position, title, description, uri, duration_seconds, embed) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    videos,
                )

            conn.commit()
            rows_loaded += len(parsed)
            print(f"releases: {rows_loaded} cargados")
            if limit and rows_loaded >= limit:
                return limit
    return rows_loaded


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa dumps Discogs XML/XML.GZ a PostgreSQL.")
    parser.add_argument("entity", choices=["artists", "labels", "masters", "releases"])
    parser.add_argument("--file", required=True, help="Ruta al dump .xml o .xml.gz")
    parser.add_argument("--dsn", default="postgresql://postgres@localhost:5432/discogs_catalog")
    parser.add_argument("--batch-size", type=int, default=250)
    parser.add_argument("--snapshot-date", help="Fecha YYYY-MM-DD; si no, se intenta deducir del nombre")
    parser.add_argument("--truncate", action="store_true", help="Vaciar tablas de esa entidad antes de importar")
    parser.add_argument("--limit", type=int, help="Importa solo N registros para prueba")
    args = parser.parse_args()

    dump_path = Path(args.file)
    if not dump_path.exists():
        raise SystemExit(f"No existe el dump: {dump_path}")

    snapshot_date = date.fromisoformat(args.snapshot_date) if args.snapshot_date else parse_date_from_filename(dump_path)
    if snapshot_date is None:
        raise SystemExit("No pude deducir snapshot_date. Usa --snapshot-date YYYY-MM-DD")

    with psycopg.connect(args.dsn) as conn:
        import_run_id: int | None = None
        try:
            with conn.cursor() as cur:
                import_run_id = ensure_import_run(cur, snapshot_date, args.entity, str(dump_path))
                if args.truncate:
                    truncate_entity(cur, args.entity)
                conn.commit()

            if args.entity == "artists":
                rows_loaded = import_artists(conn, dump_path, args.batch_size, args.limit)
            elif args.entity == "labels":
                rows_loaded = import_labels(conn, dump_path, args.batch_size, args.limit)
            elif args.entity == "masters":
                rows_loaded = import_masters(conn, dump_path, args.batch_size, args.limit)
            else:
                rows_loaded = import_releases(conn, dump_path, args.batch_size, args.limit)

            with conn.cursor() as cur:
                finish_import_run(cur, import_run_id, "completed", rows_loaded)
                conn.commit()
            print(f"Importacion completada: {args.entity} -> {rows_loaded} registros")
        except Exception as exc:
            conn.rollback()
            if import_run_id is not None:
                with conn.cursor() as cur:
                    finish_import_run(cur, import_run_id, "failed", 0, str(exc)[:2000])
                    conn.commit()
            raise


if __name__ == "__main__":
    main()

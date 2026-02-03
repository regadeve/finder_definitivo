import streamlit as st
import pandas as pd

from core.constants import GENRES, STYLES
from core.discogs_client import DiscogsClient
from core.models import SearchFilters
from core.search import search_discogs_stream

st.set_page_config(page_title="Discogs Finder", layout="wide")
st.title("🎵 Discogs Finder")

# --- Sidebar token ---
st.sidebar.title("🔐 Discogs Auth")
discogs_token = st.sidebar.text_input("Discogs personal access token", type="password")

if not discogs_token:
    st.warning("Introduce tu Discogs token en la barra lateral para poder buscar.")
    st.stop()

HEADERS = {
    "User-Agent": "DiscogsFinder/1.0 (mireia@local)",
    "Authorization": f"Discogs token={discogs_token.strip()}",
}

BASE = "https://api.discogs.com"
SEARCH_URL = f"{BASE}/database/search"
client = DiscogsClient(headers=HEADERS)

# --- State ---
if "acum" not in st.session_state:
    st.session_state.acum = []

# --- UI ---
st.markdown("## ⚙️ Filtros de búsqueda")
col1, col2 = st.columns(2)

with col1:
    year_start = st.number_input("Año de inicio", 1950, 2025, 1995)
    year_end = st.number_input("Año de fin", 1950, 2025, 1995)
    have_limit = st.number_input("Máx. Have (cuántos lo tienen)", min_value=0, value=20)

with col2:
    max_versions = st.number_input("Máx. versiones", min_value=0, value=2)
    country = st.text_input("País (ISO)", "")

format_selected = st.selectbox("Formato", ["Todos", "CD", "Vinyl"])
type_selected = st.selectbox("Tipo", ["Todos", "release", "master"])

genres = st.multiselect("Géneros", GENRES)
styles = st.multiselect("Estilos (AND)", STYLES)

strict_genre = st.checkbox("🎯 Solo géneros exactos")
strict_style = st.checkbox("🎯 Solo estilos exactos")
sin_anyo = st.checkbox("📅 Solo discos sin año")

st.markdown("### 🛒 Venta / precio")
solo_en_venta = st.checkbox("Solo si hay copias en venta")
precio_minimo = st.number_input("Precio mínimo (€)", min_value=0, value=0)
max_copias_venta = st.number_input("Máx. copias a la venta", min_value=0, value=0)

st.markdown("### ⛔ Límites")
tope_resultados = st.number_input("Tope de resultados", min_value=0, value=0)
max_pages = st.number_input("Máx. páginas a procesar (seguridad)", min_value=1, value=25)

colb1, colb2 = st.columns([1, 2])
with colb1:
    if st.button("🗑 Borrar resultados acumulados"):
        st.session_state.acum = []
        st.success("Resultados borrados.")

st.markdown("---")
st.markdown("## 📌 Resultados (en directo)")

status = st.empty()
progress = st.progress(0.0)
results_container = st.container()


def render_card(idx: int, card: dict):
    results_container.markdown(
        f"""
        <div style="margin-bottom:14px; display:flex; gap:14px; align-items:center;">
            <img src="{card.get('Imagen','')}" style="width:80px; border-radius:8px;">
            <div>
                <div style="font-weight:700;">
                    {idx}. <a href="{card.get('Enlace','')}" target="_blank">{card.get('Título','')}</a>
                </div>
                <div>{card.get('Artista','')} ({card.get('Año','')})</div>
                <div><em>{card.get('Estilos','—') or '—'}</em></div>
                <div>
                    👥 Have: {card.get('Have','—')}
                    | 🛒 En venta: {card.get('En venta',0)}
                    | 💰 Desde: {card.get('Precio más bajo','N/D')}€
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


if st.button("🔍 Buscar en Discogs"):
    progress.progress(0.0)
    status.info("Iniciando búsqueda…")

    filters = SearchFilters(
        year_start=year_start,
        year_end=year_end,
        have_limit=have_limit,
        max_versions=max_versions,
        country=country.strip(),
        format_selected=format_selected,
        type_selected=type_selected,
        genres=genres,
        styles=styles,
        strict_genre=strict_genre,
        strict_style=strict_style,
        sin_anyo=sin_anyo,
        solo_en_venta=solo_en_venta,
        precio_minimo=precio_minimo,
        max_copias_venta=max_copias_venta,
        tope_resultados=tope_resultados,
    )

    # repinta acumulados previos (para que no “desaparezcan”)
    for i, c in enumerate(st.session_state.acum, start=1):
        render_card(i, c)

    start_idx = len(st.session_state.acum)

    def progress_cb(page, total_pages, found, processed):
        progress.progress(page / max(1, total_pages))
        status.info(f"Página {page}/{total_pages} | Procesados: {processed} | Encontrados: {found}")

    def on_found(card: dict, idx_found: int):
        # se pinta al momento y se acumula
        st.session_state.acum.append(card)
        render_card(start_idx + idx_found, card)

    with st.spinner("Buscando en Discogs…"):
        _ = search_discogs_stream(
            client,
            SEARCH_URL,
            BASE,
            filters,
            max_pages=int(max_pages),
            progress_cb=progress_cb,
            on_found=on_found,
        )

    status.success(f"✅ Búsqueda terminada | Total acumulados: {len(st.session_state.acum)}")
    progress.progress(1.0)

st.markdown("---")
st.markdown("## 📄 Tabla (acumulado)")

if st.session_state.acum:
    df = pd.DataFrame(st.session_state.acum)
    st.dataframe(df, use_container_width=True, height=380)

    csv = df.to_csv(index=False).encode("utf-8")
    st.download_button("⬇️ Descargar CSV", csv, "discogs_resultados.csv", "text/csv")
else:
    st.info("Aún no hay resultados.")

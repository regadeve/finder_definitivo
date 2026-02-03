# core/models.py

from pydantic import BaseModel, Field
from typing import List, Literal


SearchType = Literal["release", "master", "Todos"]
FormatType = Literal["Todos", "CD", "Vinyl"]


class SearchFilters(BaseModel):
    year_start: int = 1995
    year_end: int = 1995
    have_limit: int = 20
    max_versions: int = 2
    country: str = ""

    format_selected: FormatType = "Todos"
    type_selected: SearchType = "Todos"

    genres: List[str] = Field(default_factory=list)
    styles: List[str] = Field(default_factory=list)

    strict_genre: bool = False
    strict_style: bool = False
    sin_anyo: bool = False

    solo_en_venta: bool = False
    precio_minimo: int = 0
    max_copias_venta: int = 0
    tope_resultados: int = 0

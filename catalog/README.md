# Discogs Catalog PostgreSQL

Este directorio prepara la base PostgreSQL para el catalogo estructural de Discogs que va a usar 103 Finder.

Objetivo inmediato:

- cargar `artists`, `labels`, `masters` y `releases` desde los dumps XML
- dejar listas las tablas relacionales para filtros estructurales reales
- calcular `master_version_counts` localmente para reemplazar `masters/{id}/versions`

## Archivos

- `import_discogs_dump.py`: importador Python en streaming para `.xml` y `.xml.gz`
- `sql/00_create_database.sql`: crea la base y el usuario base
- `sql/01_schema.sql`: crea esquema y tablas principales
- `sql/02_indexes.sql`: crea indices para busquedas y joins
- `sql/03_refresh_derived.sql`: recalcula `master_version_counts`
- `sql/04_sample_queries.sql`: ejemplos de consultas reales para 103 Finder

## Flujo recomendado

1. Instala PostgreSQL en el otro ordenador.
2. Edita la password en `sql/00_create_database.sql`.
3. Ejecuta `sql/00_create_database.sql` conectado como superusuario.
4. Conectate a `discogs_catalog` y ejecuta `sql/01_schema.sql`.
5. Instala el driver Python con `pip install psycopg[binary]`.
6. Importa los dumps en este orden:
    - artists
    - labels
    - masters
    - releases
7. Ejecuta `sql/02_indexes.sql`.
8. Ejecuta `sql/03_refresh_derived.sql`.
9. Prueba las queries de `sql/04_sample_queries.sql`.

## Ejecucion rapida con psql

```bash
psql -U postgres -f catalog/sql/00_create_database.sql
psql -U postgres -d discogs_catalog -f catalog/sql/01_schema.sql
psql -U postgres -d discogs_catalog -f catalog/sql/02_indexes.sql
psql -U postgres -d discogs_catalog -f catalog/sql/03_refresh_derived.sql
```

Ese bloque asume que ya terminaste la importacion. El paso de indices se deja para despues porque cargar millones de filas suele ser bastante mas rapido sin ellos.

## Importacion desde PowerShell

Activa tu entorno virtual y ejecuta estos comandos desde la raiz del repo.

```powershell
python catalog/import_discogs_dump.py artists --file C:\Users\deves\Desktop\dumps\discogs_20260401_artists.xml.gz --dsn postgresql://discogs_app:TU_PASSWORD@localhost:5432/discogs_catalog --truncate
python catalog/import_discogs_dump.py labels --file C:\Users\deves\Desktop\dumps\discogs_20260401_labels.xml.gz --dsn postgresql://discogs_app:TU_PASSWORD@localhost:5432/discogs_catalog --truncate
python catalog/import_discogs_dump.py masters --file C:\Users\deves\Desktop\dumps\discogs_20260401_masters.xml.gz --dsn postgresql://discogs_app:TU_PASSWORD@localhost:5432/discogs_catalog --truncate
python catalog/import_discogs_dump.py releases --file C:\Users\deves\Desktop\dumps\discogs_20260401_releases.xml.gz --dsn postgresql://discogs_app:TU_PASSWORD@localhost:5432/discogs_catalog --truncate
```

Si quieres una prueba corta antes del import completo:

```powershell
python catalog/import_discogs_dump.py artists --file C:\Users\deves\Desktop\dumps\discogs_20260401_artists.xml.gz --dsn postgresql://discogs_app:TU_PASSWORD@localhost:5432/discogs_catalog --limit 1000
```

Notas:

- Usa la password real que pusiste en `sql/00_create_database.sql`.
- Si el nombre del dump cambia de fecha, sustituye `20260401` por la fecha real.
- `--truncate` vacia las tablas de esa entidad antes de importar; para una primera carga completa es lo normal.

## Notas del modelo

- La unidad principal de filtrado es `catalog.releases`.
- `genres`, `styles`, `formats`, `artists` y `labels` se resuelven con tablas relacionales.
- Los datos dinamicos como `have`, `want`, `lowest_price` y `num_for_sale` pueden quedar en el dump como referencia, pero la app debe seguir confiando en Discogs live para valores frescos.
- `master_version_counts` se reconstruye despues de cada importacion completa de releases.

## Siguiente paso natural

Cuando este esquema este probado, el siguiente entregable deberia ser el importador Python en streaming que lea los XML `.gz` y haga inserts por lotes sobre estas tablas.

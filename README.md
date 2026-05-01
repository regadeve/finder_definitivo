# 103 FINDER

Proyecto de busqueda avanzada en Discogs con tres piezas principales:

- `api/`: API FastAPI que consulta Discogs y tambien expone el catalogo remoto de PostgreSQL por SSE.
- `web/frontend/`: interfaz principal en Next.js con autenticacion por Supabase.
- `app.py`: interfaz Streamlit heredada para pruebas rapidas.

## Transicion a app desktop

Esta copia ya empieza la migracion a app de escritorio con `Tauri` en `web/frontend/src-tauri/`.

- La idea final es que Discogs se consulte desde el equipo del usuario con su propio token.
- Supabase se mantiene para autenticacion, perfiles, favoritos, escuchados y metricas del producto.
- La pantalla inicial de configuracion desktop esta en `web/frontend/app/settings/page.tsx`.
- El token local de Discogs se guardara en el llavero seguro del sistema mediante comandos nativos de Tauri.
- La app desktop mantiene `Discogs live` en Tauri con token local del usuario.
- `Catalogo local` puede salir contra la API remota para no depender de un PostgreSQL instalado en cada PC.
- `Catalogo + live` debe usar el token personal del usuario para la parte live de Discogs; si no hay DSN local, la app primero pide candidatos al catalogo remoto y luego refresca Discogs desde desktop.

## Estado actual

La aplicacion principal es `web/frontend/` + `api/`.
El frontend legacy sin integrar ya se ha retirado de esta copia de trabajo.

## Requisitos

- Python 3.11+
- Node.js 20+
- Un token personal de Discogs
- Variables de entorno para Supabase en `web/frontend/.env.local`

## Arranque local

### 1. API

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r api/requirements.txt
uvicorn api.main:app --reload
```

### 2. Frontend

```bash
cd web/frontend
npm install
npm run dev
```

### 3. Shell desktop

```bash
cd web/frontend
npm install
npm run desktop:dev
```

Necesitas Rust/Cargo instalado para ejecutar o compilar Tauri.

### 4. Supabase profiles

Para que cada alta deje tambien un perfil en `public.profiles`, aplica la migracion:

```bash
supabase db push
```

Si no usas Supabase CLI, ejecuta manualmente el SQL de `supabase/migrations/20260313_create_profiles.sql` en el panel de Supabase.
Haz lo mismo con `supabase/migrations/20260313_create_user_releases.sql` para guardar favoritos y releases escuchados por usuario.
Y aplica tambien `supabase/migrations/20260313_extend_user_releases_metadata.sql` para poder filtrar escuchados por estilos, generos y formatos.

## Variables de entorno

### API (`api/.env`)

```env
DISCOGS_TOKEN=tu_token
DISCOGS_USER_AGENT=103Finder/1.0 (tu-email-o-app)
CATALOG_DATABASE_URL=postgresql://discogs_app:password@127.0.0.1:5432/discogs_catalog
CORS_ALLOW_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://tu-dominio.com
```

### Frontend (`web/frontend/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

En desktop, `NEXT_PUBLIC_API_URL` se usa para las rutas remotas de catalogo. `Discogs live` sigue ejecutandose de forma nativa dentro de Tauri.

En desktop se usa como origen remoto del catalogo cuando no hay DSN local guardado. En `Catalogo + live`, el servidor solo devuelve candidatos y la app desktop hace la parte live con el token personal del usuario.

## Catalogo remoto

- `POST /catalog/search`: devuelve resultados agregados del catalogo remoto.
- `POST /catalog/search/stream?mode=catalog-local`: streaming SSE solo contra PostgreSQL.
- `POST /catalog/candidates`: devuelve candidatos estructurales del catalogo remoto para que la desktop complete la parte live con el token del usuario.
- PostgreSQL debe seguir escuchando en `127.0.0.1`; la app cliente no se conecta ya por DSN directo.

## Despliegue Hetzner

- Hay una guia operativa en `HETZNER_CATALOG_API_DEPLOY.md` con `uvicorn`, `nginx`, variables `.env` y endurecimiento basico.

## Acceso

- `/`: portada con login y registro
- `/login`: alias de la misma portada para no romper rutas antiguas
- El registro crea el usuario en Supabase Auth con `signUp`
- Si existe sesion inmediata, el frontend intenta sincronizar `public.profiles`
- La migracion incluida crea la tabla `profiles` y un trigger sobre `auth.users` para mantenerla sincronizada
- `/favorites`: favoritos del usuario autenticado
- `/listened`: historial de releases escuchados por usuario con filtros y ordenacion
- Los favoritos y los releases abiertos se guardan por usuario en `public.user_releases`

## Prioridades de refactor

1. Unificar la logica de filtros entre `api/` y `core/`.
2. Decidir si `app.py` sigue siendo parte del producto o solo una herramienta interna.
3. Añadir tests para filtros, parseo y contrato SSE.
4. Mejorar cache y observabilidad de llamadas a Discogs.

## Documentacion adicional

- `MOBILE_APP_PLAN.md`: plan tecnico para llevar la app a Android/iPhone con token local de Discogs por usuario y requests nativas.

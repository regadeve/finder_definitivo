# Documentacion tecnica de PROJECT_3_4

## 1. Que es este proyecto

`PROJECT_3_4` es la base de `103 FINDER`, una aplicacion para buscar releases en Discogs con filtros avanzados.

Hoy conviven estas piezas:

- `web/frontend/`: app principal en Next.js 16 + React 19.
- `web/frontend/src-tauri/`: shell desktop en Tauri 2 + Rust.
- `api/`: API FastAPI para el flujo web/proxy y parte de billing heredada.
- `billing-api/`: microservicio FastAPI dedicado a Stripe + Supabase.
- `public-landing/`: landing publica que sirve la descarga y los assets del updater desktop.
- `supabase/migrations/`: esquema SQL y politicas RLS.
- `app.py`: interfaz heredada tipo laboratorio/prototipo.

La direccion tecnica actual esta bastante clara en `README.md`: la app de escritorio es la direccion principal, con token de Discogs guardado localmente y Supabase reservado para identidad, perfiles, estado de usuario, favoritos, escuchados y metricas.

## 2. Servicios utilizados

### 2.1 Discogs

Uso:

- Fuente principal de catalogo y metadatos.
- Busquedas por `database/search`.
- Lectura de detalles de release/master.
- Control de versiones por master.

Donde se usa:

- Web/proxy: `api/main.py`.
- Desktop/local: `web/frontend/src-tauri/src/lib.rs`.

Como funciona:

- En modo web/proxy, el backend usa `DISCOGS_TOKEN` del servidor y expone `/search/stream` por SSE.
- En modo desktop, cada usuario guarda su propio token en el keychain del sistema con Tauri (`keyring`), y la app consulta Discogs directamente desde el equipo del usuario.
- Hay reintentos, backoff y pausa basica cuando el rate limit de Discogs se acerca al limite.

### 2.2 Supabase

Uso:

- Auth de usuarios.
- Base de datos Postgres.
- RLS para aislar datos por usuario.
- Storage para avatares.
- RPC para presencia (`touch_user_presence`).

Tablas y objetivos principales:

- `profiles`: perfil base, email, nombre, flags admin y `last_seen_at`.
- `user_subscriptions`: estado sincronizado de Stripe por usuario.
- `user_searches`: historial de busquedas y filtros.
- `user_releases`: favoritos y releases escuchados.
- `yearless_release_hits`: releases detectados sin año para analisis de catalogo.
- `billing_invoices`: facturas sincronizadas desde Stripe.
- `billing_events`: eventos Stripe saneados para auditoria.

Donde se usa:

- Cliente web: `web/frontend/lib/supabase/client.ts`, `web/frontend/lib/supabase/server.ts`.
- Acceso y permisos: `web/frontend/lib/supabase/access.ts`.
- Presencia: `web/frontend/components/UserPresenceHeartbeat.tsx`, `web/frontend/lib/supabase/profile.ts`.
- Favoritos/escuchados: `web/frontend/lib/supabase/user-releases.ts`.
- Historial de busquedas: `web/frontend/lib/supabase/user-searches.ts`.
- Esquema: `supabase/migrations/`.

### 2.3 Stripe

Uso:

- Checkout de suscripcion.
- Customer Portal.
- Webhooks para sincronizar suscripciones, invoices y eventos.

Donde se usa:

- Servicio recomendado: `billing-api/main.py`.
- Implementacion heredada/mixta tambien existe en `api/main.py`.

Flujo:

- El frontend pide una session a Billing API con el JWT de Supabase.
- Billing API valida el usuario contra Supabase Auth.
- Stripe crea checkout o portal.
- El webhook actualiza `user_subscriptions`, `billing_invoices` y `billing_events`.

### 2.4 Tauri updater

Uso:

- Updates de la app desktop en Windows.

Donde se configura:

- `web/frontend/src-tauri/tauri.conf.json`.
- `web/frontend/src-tauri/src/lib.rs`.
- `web/frontend/lib/desktop/updater.ts`.
- `web/frontend/scripts/release-desktop.mjs`.
- `web/frontend/scripts/publish-updater.mjs`.

Como funciona:

- La build genera instalador NSIS y artefactos de updater.
- El script copia instalador, `.sig` y `latest.json` a `public-landing/public/updates` y `public-landing/public/downloads`.
- La app desktop consulta `https://103finder.shop/updates/latest.json` y valida con la public key embebida.

### 2.5 Vercel / hosting estatico

Uso:

- `public-landing/` esta pensada para desplegarse en Vercel.
- El frontend Next principal usa `output: "export"`, o sea build estatica exportable.

Observacion:

- En `web/frontend/next.config.ts` hay headers de seguridad definidos, pero Next avisa que con `output: export` esos headers no se aplican automaticamente. Si se quieren en produccion, hay que ponerlos en el reverse proxy/CDN/hosting.

## 3. Arquitectura general

### 3.1 App web

Stack:

- Next.js 16.
- React 19.
- TypeScript.
- Supabase JS.
- Recharts para metricas.

Rutas importantes:

- `/`: portada / acceso.
- `/login`: login.
- `/billing`: checkout y portal.
- `/search`: flujo de busqueda.
- `/favorites`: favoritos.
- `/listened`: escuchados.
- `/settings`: token de Discogs, perfil y updater.
- `/metrics`: panel admin.

La UI usa Supabase para autenticacion y datos de usuario, y en desktop usa Tauri para operaciones nativas.

### 3.2 Busqueda de Discogs

Hay dos modelos en el repo:

- Modelo web/proxy: `api/main.py` expone `POST /search/stream` y devuelve eventos SSE (`status`, `item`, `done`).
- Modelo desktop/local: `web/frontend/src-tauri/src/lib.rs` ejecuta la busqueda en Rust y emite eventos Tauri `discogs-search`.

El frontend ya esta orientado a desktop: `web/frontend/lib/discogs/search-stream.ts` rechaza la busqueda fuera de Tauri con el mensaje de que la busqueda solo esta disponible en desktop.

### 3.3 Billing

El frontend usa `web/frontend/lib/billing/api.ts`:

- `NEXT_PUBLIC_BILLING_API_URL` es el endpoint preferido.
- Si no existe, cae a `NEXT_PUBLIC_API_URL`.
- Por defecto local usa `http://localhost:8010`.

La separacion mas sana es:

- `api/` para busqueda Discogs y fallback heredado.
- `billing-api/` para Stripe + Supabase.

### 3.4 Landing publica

`public-landing/` hace dos cosas:

- presentar producto;
- servir instalador y `latest.json` del updater.

Esto convierte la landing en parte del pipeline de release desktop.

## 4. Estado real del arranque local

Verificado en esta copia:

- API FastAPI: arranca correctamente con `python -m uvicorn main:app --host 127.0.0.1 --port 8000` en `api/`.
- Frontend Next: arranca correctamente con `npm run dev` en `web/frontend/` y queda en `http://localhost:3000`.
- Desktop Tauri: arranca con `npm run desktop:dev` en `web/frontend/`.

Incidencia observada:

- Si ya existe otro `next dev` corriendo, `tauri dev` falla porque `beforeDevCommand` intenta lanzar otro servidor y Next no puede tomar el lock de `.next/dev/lock`.
- Solucion practica: cerrar instancias previas de `npm run dev` antes de lanzar `npm run desktop:dev`.

Tambien puedes usar `launch-desktop-app.cmd` desde la raiz.

## 5. Variables de entorno

### 5.1 `api/.env`

Minimo para search proxy:

```env
DISCOGS_TOKEN=...
DISCOGS_USER_AGENT=103Finder/1.0 (email-o-app)
```

Si esa API tambien hace billing heredado, ademas necesita:

```env
APP_BASE_URL=http://localhost:3000
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_PRICE_ID=...
STRIPE_WEBHOOK_SECRET=...
```

### 5.2 `billing-api/.env`

Variables esperadas segun `billing-api/README.md`:

```env
APP_BASE_URL=...
ALLOWED_ORIGINS=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_PRICE_ID=...
STRIPE_WEBHOOK_SECRET=...
```

### 5.3 `web/frontend/.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_BILLING_API_URL=http://localhost:8010
```

Opcionales relevantes:

- `NEXT_PUBLIC_APP_DOWNLOAD_URL`
- `NEXT_PUBLIC_APP_BASE_URL`

### 5.4 `public-landing/.env.local`

```env
NEXT_PUBLIC_LOGIN_URL=...
NEXT_PUBLIC_SUPPORT_EMAIL=...
```

## 6. Como esta hecho el login, acceso y permisos

1. El usuario se registra/loguea con Supabase Auth.
2. Un trigger SQL crea o sincroniza `public.profiles` cuando nace un usuario (`supabase/migrations/20260313_create_profiles.sql`).
3. El frontend consulta `profiles` y `user_subscriptions` para decidir acceso (`web/frontend/lib/supabase/access.ts`).
4. Un usuario puede usar la app si cumple una de estas:
   - suscripcion `active` o `trialing`;
   - `bypass_subscription = true`;
   - `is_admin = true`.

## 7. Como se guarda actividad y trafico

No hay una plataforma de analytics dedicada tipo GA, PostHog o Mixpanel en este repo. El trafico y uso se observan con Supabase + panel admin.

### 7.1 Lo que ya se guarda

- Presencia aproximada del usuario en `profiles.last_seen_at` via heartbeat cada 5 minutos.
- Busquedas en `user_searches` con filtros, estado y numero de resultados.
- Favoritos y escuchados en `user_releases`.
- Releases sin año detectados en `yearless_release_hits`.
- Suscripciones en `user_subscriptions`.
- Facturas en `billing_invoices`.
- Eventos Stripe en `billing_events`.

### 7.2 Como ver el trafico ahora mismo

Opcion 1 - desde la propia app:

- entrar como admin a `/metrics`.
- esa pantalla carga datos de `profiles`, `user_subscriptions`, `user_searches`, `user_releases`, `yearless_release_hits`, `billing_invoices` y `billing_events`.

Opcion 2 - desde Supabase Studio:

- revisar Auth > Users para altas.
- revisar Table Editor / SQL para tablas de negocio.
- revisar Storage si quieres comprobar avatares.

Opcion 3 - con SQL directo en Supabase:

```sql
-- usuarios vistos recientemente
select id, email, last_seen_at
from public.profiles
order by last_seen_at desc nulls last;

-- volumen de busquedas por dia
select date_trunc('day', created_at) as day, count(*) as searches
from public.user_searches
group by 1
order by 1 desc;

-- estado de suscripciones
select status, count(*)
from public.user_subscriptions
group by status
order by count(*) desc;

-- eventos Stripe recientes
select event_type, created_at, user_id
from public.billing_events
order by created_at desc
limit 100;
```

### 7.3 Logs locales utiles

En esta copia hay varios logs generados para desarrollo, por ejemplo:

- `api/uvicorn.out.log`
- `api/uvicorn.err.log`
- `web/frontend/tauri.out.log`
- `web/frontend/tauri.err.log`
- `frontend-dev.log`

Sirven para diagnostico local, no como observabilidad de produccion.

## 8. Como subir nuevas updates desktop

El flujo correcto hoy es este.

### 8.1 Preparacion

En `web/frontend/` tener:

- dependencias instaladas;
- Rust/Cargo operativo;
- clave del updater disponible en la maquina;
- `public-landing/` listo para desplegarse luego.

### 8.2 Crear una release obligatoria

Comando:

```bash
npm run desktop:release -- --version 0.1.3 --notes "Mejoras de estabilidad y nuevo flujo de actualizacion"
```

Que hace exactamente:

1. Actualiza version en:
   - `web/frontend/package.json`
   - `web/frontend/package-lock.json`
   - `web/frontend/src-tauri/Cargo.toml`
   - `web/frontend/src-tauri/tauri.conf.json`
2. Ejecuta `npm run desktop:build`.
3. Ejecuta `npm run desktop:publish-updater`.
4. Copia instalador, firma y `latest.json` a:
   - `public-landing/public/updates`
   - `public-landing/public/downloads`
5. Hace build de `public-landing/` salvo que uses `--skip-landing-build`.

### 8.3 Release opcional

```bash
npm run desktop:release -- --version 0.1.3 --notes "Hotfix menor" --optional
```

Eso marca `required = false` en `latest.json`.

### 8.4 Publicar de verdad

Despues del comando anterior todavia falta desplegar `public-landing/`.

Sin ese despliegue:

- la web publica no servira el nuevo instalador;
- la app desktop no vera el nuevo `latest.json` publicado.

### 8.5 Archivo clave del updater

El manifiesto activo actual es `public-landing/public/updates/latest.json`.

Campos relevantes:

- `version`
- `notes`
- `pub_date`
- `required`
- `minimum_version`
- `download_path`
- `platforms.windows-x86_64.signature`
- `platforms.windows-x86_64.url`

## 9. Como subir cambios normales a produccion

### 9.1 Frontend / desktop UI

1. Cambiar codigo en `web/frontend/`.
2. Probar con `npm run dev`.
3. Probar desktop con `npm run desktop:dev`.
4. Si el cambio afecta updater o binario, sacar release desktop.
5. Desplegar `public-landing/` si cambias instalador o assets publicos.

### 9.2 Cambios de billing

1. Cambiar `billing-api/`.
2. Probar local con `uvicorn main:app --reload --host 127.0.0.1 --port 8010`.
3. Desplegar ese servicio en Railway/Render o equivalente.
4. Confirmar webhook de Stripe apuntando al endpoint publico final.

### 9.3 Cambios de base de datos

1. Crear migracion SQL en `supabase/migrations/`.
2. Aplicarla con `supabase db push` o desde Supabase SQL Editor.
3. Verificar politicas RLS y funciones RPC.
4. Luego desplegar frontend/backend que dependan del nuevo esquema.

## 10. Riesgos y observaciones importantes

- Hay duplicidad de billing entre `api/main.py` y `billing-api/main.py`; conviene consolidar y dejar uno solo como verdad.
- `billing-api/` parece vivir como repo separado anidado, lo cual complica versionado si no se documenta bien.
- La app web principal ya no parece el canal de busqueda recomendado; el flujo real apunta a desktop local.
- No hay analytics de producto dedicados; el trafico se infiere desde Supabase.
- `next.config.ts` define headers, pero con export estatico no se aplican automaticamente.

## 11. Recomendacion operativa

Si quieres una operativa limpia, yo dejaria este reparto:

- `web/frontend/` = UI web + shell desktop.
- `web/frontend/src-tauri/` = integraciones nativas, token local y updater.
- `billing-api/` = unico backend publico de Stripe.
- `api/` = solo fallback heredado de Discogs o retirarlo cuando desktop sea definitivo.
- `public-landing/` = web publica + descarga + metadata de updater.
- `supabase/` = unica fuente de datos de usuarios, historial y metricas.

## 12. Comandos rapidos

### Desarrollo

```bash
# search API
cd api
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# billing API
cd billing-api
uvicorn main:app --reload --host 127.0.0.1 --port 8010

# frontend
cd web/frontend
npm run dev

# desktop
cd web/frontend
npm run desktop:dev

# landing publica
cd public-landing
npm run dev
```

### Release desktop

```bash
cd web/frontend
npm run desktop:release -- --version 0.1.3 --notes "Texto de release"
```

### Migraciones Supabase

```bash
supabase db push
```

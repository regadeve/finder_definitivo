# Manual operativo de PROJECT_3_4

## 1. Objetivo

Este manual sirve para operar `103 FINDER` en local y en produccion sin tener que releer toda la documentacion tecnica.

## 2. Componentes que hay que conocer

- `web/frontend/`: app principal y shell desktop.
- `web/frontend/src-tauri/`: runtime nativo desktop.
- `billing-api/`: backend recomendado para Stripe.
- `public-landing/`: web publica, instalador y metadata del updater.
- `supabase/`: base de datos, auth, storage y metricas.
- `api/`: backend de busqueda heredado/fallback.

## 3. Operacion diaria

### Arranque local rapido

```bash
# 1) API de busqueda heredada
cd api
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# 2) Billing API
cd billing-api
uvicorn main:app --reload --host 127.0.0.1 --port 8010

# 3) Frontend web
cd web/frontend
npm run dev

# 4) Desktop
cd web/frontend
npm run desktop:dev

# 5) Landing publica
cd public-landing
npm run dev
```

### Regla importante para desktop

Antes de lanzar `npm run desktop:dev`, asegúrate de no tener otro `next dev` corriendo en `web/frontend/`, porque Tauri lanza su propio `beforeDevCommand` y si encuentra un lock activo falla.

## 4. Checklist de preproduccion

Antes de desplegar cambios:

- confirmar variables de entorno de `web/frontend/`, `billing-api/`, `public-landing/` y, si aplica, `api/`;
- validar login/logout con Supabase;
- validar acceso de usuario activo, admin y usuario sin suscripcion;
- validar Checkout y Portal Stripe;
- validar webhook Stripe contra entorno correcto;
- validar que `/metrics` carga con un usuario admin;
- validar que la desktop guarda y lee token de Discogs;
- validar updater si cambias version desktop.

## 5. Operativa de releases desktop

### Paso 1 - preparar entorno

- Node y npm funcionando.
- Rust/Cargo funcionando.
- clave del updater disponible en la maquina de build.
- `public-landing/` listo para desplegar.

### Paso 2 - generar release

Desde `web/frontend/`:

```bash
npm run desktop:release -- --version 0.1.3 --notes "Texto de release"
```

Opcional:

```bash
npm run desktop:release -- --version 0.1.3 --notes "Hotfix" --optional
```

### Paso 3 - verificar artefactos

Comprobar que existen:

- `public-landing/public/updates/latest.json`
- `public-landing/public/updates/103-Finder-Windows-x64-Setup.exe`
- `public-landing/public/updates/103-Finder-Windows-x64-Setup.exe.sig`
- `public-landing/public/downloads/103-Finder-Windows-x64-Setup.exe`

### Paso 4 - desplegar landing

Sin desplegar `public-landing/`, la release no queda publicada.

Esto es obligatorio porque la landing sirve:

- el instalador publico;
- el `latest.json` consumido por el updater.

### Paso 5 - verificacion posterior

- abrir la landing publica y comprobar que ofrece la nueva version;
- revisar `public-landing/public/updates/latest.json` desplegado;
- abrir una build desktop anterior y comprobar que detecta update;
- validar instalacion limpia.

## 6. Operativa de billing

### Alta de una nueva suscripcion

1. Usuario autenticado en frontend.
2. Frontend llama a Billing API.
3. Billing API valida JWT Supabase.
4. Stripe crea Checkout.
5. Stripe envia webhook.
6. Billing API sincroniza `user_subscriptions`.

### Si Stripe no actualiza acceso

Revisar en este orden:

1. `billing-api` vivo y accesible.
2. `STRIPE_WEBHOOK_SECRET` correcto.
3. endpoint configurado en Stripe.
4. tabla `user_subscriptions` en Supabase.
5. registros en `billing_events` y `billing_invoices`.

## 7. Operativa de trafico y uso

### Vista rapida

- abrir `/metrics` con usuario admin.

### Vista detallada en Supabase

Tablas utiles:

- `profiles`
- `user_searches`
- `user_releases`
- `yearless_release_hits`
- `user_subscriptions`
- `billing_invoices`
- `billing_events`

### Consultas SQL utiles

```sql
select date_trunc('day', created_at) as day, count(*)
from public.user_searches
group by 1
order by 1 desc;

select status, count(*)
from public.user_subscriptions
group by status;

select event_type, created_at, user_id
from public.billing_events
order by created_at desc
limit 50;
```

## 8. Incidencias tipicas

### Desktop no arranca

- revisar que no haya otro `next dev` vivo;
- revisar Rust/Cargo;
- revisar logs `web/frontend/tauri.out.log` y `web/frontend/tauri.err.log`.

### Frontend carga pero billing falla

- revisar `NEXT_PUBLIC_BILLING_API_URL`;
- revisar CORS de `billing-api`;
- revisar JWT Supabase y sesion activa.

### Login funciona pero no hay perfil

- revisar trigger/migracion de `profiles`;
- revisar errores de sincronizacion en cliente;
- revisar politicas RLS.

### Updater no encuentra version nueva

- revisar que se haya desplegado `public-landing/`;
- revisar `latest.json`;
- revisar firma y public key del updater;
- revisar URL final `https://103finder.shop/updates/latest.json`.

## 9. Ruta recomendada de operacion

- usar `billing-api/` como backend unico de Stripe;
- usar `public-landing/` como punto oficial de distribucion;
- usar Supabase como unica fuente de metricas operativas;
- dejar `api/` solo como legado/fallback mientras exista necesidad real.

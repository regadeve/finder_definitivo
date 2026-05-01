# Diagrama tecnico de PROJECT_3_4

## 1. Arquitectura general

```text
                           +----------------------+
                           |    Public Landing    |
                           |   public-landing/    |
                           |  103finder.shop      |
                           +----------+-----------+
                                      |
                         descarga exe |
                         latest.json  |
                                      v
 +------------------+       +---------+----------+
 |  Usuario Web     |       |  Usuario Desktop   |
 | navegador        |       | Tauri + Next UI    |
 +--------+---------+       +----------+---------+
          |                               |
          | login / datos                 | login / datos
          |                               |
          +---------------+---------------+
                          |
                          v
                +---------+----------+
                |      Supabase      |
                | Auth / DB / RLS    |
                | Storage / RPC      |
                +----+----+----+-----+
                     |    |    |
         perfiles ---+    |    +--- metricas / billing tables
  favoritos/escuchas -----+
                     |
                     +-----------------------+
                                             |
                                             v
                                   +---------+---------+
                                   |    Billing API    |
                                   |   billing-api/    |
                                   +---------+---------+
                                             |
                                             v
                                         +---+---+
                                         | Stripe |
                                         +---+---+
                                             ^
                                             |
                                         webhooks


 Desktop search path:

 Usuario Desktop -> Tauri Rust -> Discogs API


 Legacy / fallback search path:

 Usuario Web -> api/ FastAPI -> Discogs API -> SSE -> Frontend
```

## 2. Capas por modulo

### `web/frontend/`

```text
Next.js app
  |
  +-- AuthShell / login / settings / billing / metrics
  +-- lib/supabase/*
  +-- lib/billing/api.ts
  +-- lib/discogs/search-stream.ts
  +-- lib/search/session.ts
```

### `web/frontend/src-tauri/`

```text
Tauri shell
  |
  +-- keyring local para token Discogs
  +-- updater nativo
  +-- search engine Rust
  +-- eventos discogs-search hacia React
```

### `billing-api/`

```text
FastAPI
  |
  +-- create-checkout-session
  +-- create-portal-session
  +-- stripe/webhook
  +-- sync con Supabase
```

### `api/`

```text
FastAPI legacy/fallback
  |
  +-- /search/stream por SSE
  +-- usa token Discogs del servidor
  +-- contiene billing heredado mezclado
```

## 3. Flujo de autenticacion y acceso

```text
Usuario -> Supabase Auth -> session JWT
        -> Frontend consulta profiles + user_subscriptions
        -> decide si puede usar la app

Reglas actuales:
- active/trialing
- o bypass_subscription
- o is_admin
```

## 4. Flujo de busqueda desktop

```text
Usuario -> Settings guarda token Discogs
        -> token se guarda en keychain local
        -> SearchClient llama invoke("start_discogs_search")
        -> Rust consulta Discogs directamente
        -> Rust emite eventos "discogs-search"
        -> React pinta resultados
        -> Supabase guarda historial y yearless hits
```

## 5. Flujo de billing

```text
Frontend -> Billing API -> Stripe Checkout/Portal
                           |
                           +-> webhook -> Billing API
                                          |
                                          +-> Supabase user_subscriptions
                                          +-> Supabase billing_invoices
                                          +-> Supabase billing_events
```

## 6. Flujo de updates desktop

```text
web/frontend release script
  -> tauri build
  -> genera exe + sig
  -> publish-updater.mjs
  -> copia artefactos a public-landing/public
  -> despliegue de public-landing
  -> desktop app consulta latest.json
  -> updater descarga e instala
```

## 7. Flujo de observabilidad actual

```text
Uso de app
  -> profiles.last_seen_at
  -> user_searches
  -> user_releases
  -> yearless_release_hits
  -> billing_invoices
  -> billing_events
  -> panel /metrics
```

## 8. Punto debil principal del diagrama actual

```text
Hay dos backends Python con responsabilidades cruzadas:

api/         -> search legacy + billing heredado
billing-api/ -> billing recomendado

Eso mete duplicidad operativa y riesgo de configuracion inconsistente.
```

# Frontend 103 FINDER

Frontend principal de la aplicacion. Consume la API FastAPI por SSE, usa Supabase para la autenticacion del cliente y ahora incluye una base Tauri para empaquetarlo como app desktop.

## Desarrollo

```bash
npm install
npm run dev
```

## Desktop

```bash
npm install
npm run desktop:dev
```

Para Tauri necesitas Rust/Cargo instalado en la maquina.

## Variables necesarias

Crear `web/frontend/.env.local` con:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_BILLING_API_URL=https://api.103finder.shop
```

`NEXT_PUBLIC_BILLING_API_URL` se usa para Checkout, portal de Stripe y webhooks asociados al backend minimo de billing. `NEXT_PUBLIC_API_URL` puede seguir apuntando a la API de busqueda si mantienes ambos servicios separados.

## Estado de la migracion desktop

- `src-tauri/`: shell nativa inicial para Windows/macOS/Linux.
- `app/settings/page.tsx`: pantalla de configuracion del token local de Discogs.
- `lib/desktop/discogs-token.ts`: puente entre React y los comandos nativos de Tauri.
- `lib/discogs/search-stream.ts`: capa intermedia que usa Tauri en desktop y backend proxy en modo web.
- `src-tauri/src/lib.rs`: implementa guardado seguro del token y la busqueda local de Discogs con eventos de progreso/cancelacion.

## Flujo principal

- `app/login/page.tsx`: login con Supabase.
- `app/filters/page.tsx`: constructor de filtros.
- `app/search/page.tsx`: parsea query params y arranca la busqueda.
- `app/search/SearchClient.tsx`: consume SSE y pinta resultados en tiempo real.

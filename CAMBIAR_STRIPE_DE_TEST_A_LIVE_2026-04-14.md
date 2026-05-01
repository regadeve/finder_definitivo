# Cambiar Stripe de test a live - 2026-04-14

## Objetivo

Pasar el cobro de Stripe desde modo prueba a modo real sin romper:

- Checkout de suscripcion
- Customer Portal
- webhooks
- sincronizacion con Supabase

## Resumen rapido

Para pasar a live no hay que reescribir la app. Lo importante es cambiar las credenciales y el `price` en los servicios correctos:

- Stripe Dashboard: crear o localizar el producto/precio live y el webhook live
- Railway o hosting del `billing-api`: cambiar `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- Vercel o hosting del frontend: confirmar `NEXT_PUBLIC_BILLING_API_URL`
- Si usas el backend monolitico `api/` para billing en vez de `billing-api/`, repetir ahi las mismas variables de Stripe

## Arquitectura actual

### Frontend

- `web/frontend/lib/billing/api.ts`
  - llama a `NEXT_PUBLIC_BILLING_API_URL`
- `web/frontend/app/billing/page.tsx`
  - abre Checkout y Customer Portal

### Backend de billing

- `billing-api/main.py`
  - crea sesiones de Checkout
  - crea sesiones de Portal
  - recibe `POST /stripe/webhook`
  - usa estas variables:
    - `STRIPE_SECRET_KEY`
    - `STRIPE_PRICE_ID`
    - `STRIPE_WEBHOOK_SECRET`
    - `APP_BASE_URL`
    - `ALLOWED_ORIGINS`

### Variante heredada

Tambien existe logica Stripe en `api/main.py`. Si en algun despliegue tu frontend apunta a ese backend para billing, entonces hay que cambiar tambien ahi las variables de Stripe.

## Ficheros y sitios a revisar

### En el repo

- `billing-api/.env.example`
- `billing-api/README.md`
- `billing-api/main.py`
- `web/frontend/lib/billing/api.ts`
- `web/frontend/.env.local`
- `api/main.py` solo si ese backend gestiona billing en tu despliegue real

### En plataformas

- Stripe Dashboard
- Railway o el hosting donde este desplegado `billing-api`
- Vercel o el hosting donde este desplegado `web/frontend`
- Opcionalmente el dominio/API reverse proxy si `api.103finder.shop` apunta a otro servicio

## Paso 1. Confirmar que vas a usar el backend correcto

Lo normal en este proyecto es usar `billing-api` como backend de cobro dedicado.

Compruebalo en el frontend:

- archivo: `web/frontend/lib/billing/api.ts`
- variable usada: `NEXT_PUBLIC_BILLING_API_URL`

Si esa URL apunta a tu Billing API real, el cambio a live debe hacerse ahi.

Si por cualquier razon el frontend apunta al backend general `api/`, entonces hay que cambiar las variables de Stripe en ese servicio y no solo en `billing-api`.

## Paso 2. Preparar Stripe en modo live

En el panel de Stripe, cambia a modo live y prepara estos 3 elementos.

### 2.1 Secret key live

Necesitas una clave tipo:

- `sk_live_...`

No uses ya `sk_test_...`.

### 2.2 Price live

En live debes crear o localizar el precio real del plan.

Ahora mismo el código crea Checkout con un `price` desde variable de entorno:

- `billing-api/main.py:383`

Por tanto necesitas un `price_...` live del producto correcto, por ejemplo el de `10 EUR/mes`.

### 2.3 Webhook live

Tienes que crear un endpoint webhook en Stripe live para:

- `https://api.103finder.shop/stripe/webhook`

Y copiar su secreto:

- `whsec_...`

Ese secreto no sirve si viene del entorno test; cada endpoint live tiene el suyo.

## Paso 3. Revisar que el producto/precio live es el correcto

Antes de tocar Railway o producción, confirma en Stripe live:

- producto correcto
- importe correcto
- moneda correcta
- periodicidad correcta (`mensual`)
- price activo

En tu caso, por la UI actual del frontend, el plan esperado es:

- `10 EUR/mes`

## Paso 4. Cambiar variables en Railway o hosting del Billing API

En el servicio donde corre `billing-api`, sustituye las variables de test por las live.

### Variables a cambiar

- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_PRICE_ID=price_...` del plan live
- `STRIPE_WEBHOOK_SECRET=whsec_...` del endpoint live

### Variables que debes revisar aunque no cambien

- `APP_BASE_URL=https://app.103finder.shop` o la URL real donde vive tu frontend
- `ALLOWED_ORIGINS=...` con tus dominios reales
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Archivo de referencia

- `billing-api/.env.example`

### Importante

No metas estas claves live en el repo. Solo en variables de entorno del servicio desplegado.

## Paso 5. Revisar Vercel o el hosting del frontend

El frontend no usa la secret key de Stripe directamente, pero si necesita apuntar al backend de billing correcto.

### Variable a revisar

- `NEXT_PUBLIC_BILLING_API_URL`

Archivo de referencia local:

- `web/frontend/.env.local`

En producción debe apuntar a tu backend real, por ejemplo:

```env
NEXT_PUBLIC_BILLING_API_URL=https://api.103finder.shop
```

Si esta variable sigue apuntando a un entorno de pruebas o localhost, Checkout no funcionará aunque Stripe live esté bien configurado.

## Paso 6. Revisar el dominio y retorno de Stripe

`billing-api` genera las URLs de retorno con `APP_BASE_URL`.

Se usa aquí:

- `billing-api/main.py:385`
- `billing-api/main.py:386`
- `billing-api/main.py:406`

Por eso debes confirmar que `APP_BASE_URL` es la URL real del frontend que quieres usar en live.

Ejemplos correctos según tu despliegue:

- `https://app.103finder.shop`
- `https://www.103finder.shop`

Si esto está mal, Stripe pagará bien pero devolverá al usuario a la URL equivocada.

## Paso 7. Crear o revisar el webhook live en Stripe

En Stripe live crea el endpoint:

```text
https://api.103finder.shop/stripe/webhook
```

Eventos recomendados como mínimo:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

El backend sincroniza suscripciones y eventos hacia Supabase, así que este paso es obligatorio.

## Paso 8. Desplegar el backend de billing con las variables nuevas

Una vez cambies las variables en Railway o en tu hosting, redeploya el servicio para que cargue:

- `sk_live_...`
- `price_...` live
- `whsec_...` live

Si Railway redeploya automáticamente al guardar variables, aun así conviene verificar que el servicio reinició correctamente.

## Paso 9. Desplegar o redeployar el frontend si hiciste cambios de entorno

Si modificaste `NEXT_PUBLIC_BILLING_API_URL` en Vercel, hace falta redeploy del frontend para que el valor quede embebido en la build.

Si no cambiaste esa variable y ya apuntaba al backend real, este paso puede no ser necesario.

## Paso 10. Verificaciones manuales en live

Haz estas comprobaciones en orden.

### 10.1 Health del backend

Comprueba que el backend responde:

```text
https://api.103finder.shop/health
```

### 10.2 Checkout

- entra con un usuario real de prueba controlada
- pulsa `Suscribirme por 10 EUR/mes`
- confirma que se abre Stripe live y no test

### 10.3 Retorno

- tras pagar, confirma que vuelves a `/billing`
- revisa el mensaje de exito

### 10.4 Supabase

Comprueba en tablas como:

- `user_subscriptions`
- `billing_events`
- `billing_invoices`

que los eventos nuevos llegan con `livemode = true`.

### 10.5 Portal

- pulsa `Gestionar suscripcion`
- confirma que abre el Customer Portal live

## Paso 11. Si usas el backend `api/` para billing, repetir ahi el cambio

Existe código Stripe duplicado en:

- `api/main.py`

Si producción usa ese servicio para Checkout/webhooks, también debes cambiar en ese entorno:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `APP_BASE_URL`

Si no lo usas para billing en producción, no hace falta tocarlo.

## Lista exacta de variables por plataforma

### Stripe Dashboard

- secret key live
- price id live
- webhook secret live

### Railway o hosting de `billing-api`

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `APP_BASE_URL`
- `ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Vercel o hosting de `web/frontend`

- `NEXT_PUBLIC_BILLING_API_URL`
- revisar también `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` si hubiese varios entornos

### Public landing

Normalmente no requiere cambios Stripe para este paso.

`public-landing/.env.example` solo usa:

- `NEXT_PUBLIC_LOGIN_URL`
- `NEXT_PUBLIC_SUPPORT_EMAIL`

## Qué ficheros cambian de verdad

Si solo haces el paso de test a live bien planteado, muchas veces no necesitas cambiar código, solo variables en plataforma.

Los ficheros que sirven como referencia son:

- `billing-api/.env.example`
- `billing-api/main.py`
- `web/frontend/.env.local`
- `web/frontend/lib/billing/api.ts`
- `api/main.py` si el billing real va por ahi

Pero en producción lo normal es tocar:

- variables en Railway
- variables en Vercel
- configuración en Stripe Dashboard

## Errores típicos al pasar a live

- dejar `sk_test_...` en producción
- poner un `price_...` de test con una `sk_live_...`
- olvidar cambiar el `whsec_...` del webhook
- no redeployar el servicio después de cambiar variables
- dejar `NEXT_PUBLIC_BILLING_API_URL` apuntando a localhost o staging
- tener `APP_BASE_URL` mal y que Stripe vuelva a una URL incorrecta
- crear pagos live pero mirar luego eventos en Stripe test

## Checklist final

- Stripe live tiene producto y precio correctos
- Stripe live tiene webhook creado
- Railway tiene `STRIPE_SECRET_KEY` live
- Railway tiene `STRIPE_PRICE_ID` live
- Railway tiene `STRIPE_WEBHOOK_SECRET` live
- Railway tiene `APP_BASE_URL` correcto
- Vercel tiene `NEXT_PUBLIC_BILLING_API_URL` correcto
- backend redeployado
- frontend redeployado si cambió env pública
- una compra real controlada llega a Supabase con `livemode = true`

## Recomendacion operativa

Haz primero una compra live real de importe pequeño o del propio plan con una cuenta controlada por ti, verifica webhook + Supabase + acceso, y solo después lo des por cerrado para usuarios reales.

# Plan para app movil (Android / iPhone)

Esta documentacion describe como llevar `103 FINDER` a movil sin compartir el token de Discogs entre usuarios y sin depender de un proxy central para las busquedas.

## Objetivo

- Reutilizar la mayor parte posible del frontend actual.
- Mantener Supabase para auth, perfiles, billing y metricas.
- Hacer las busquedas de Discogs desde el propio dispositivo del usuario.
- Guardar el token de Discogs localmente y de forma segura por usuario.
- Evitar que todos los usuarios consuman una misma cuota central de Discogs.

## Aclaracion importante sobre el limite de Discogs

Discogs documenta el rate limit por IP de origen, no por token.

- 60 peticiones por minuto para requests autenticadas.
- 25 por minuto para requests no autenticadas.

Consecuencias practicas:

- Si cada usuario usa su movil con su propia conexion, normalmente no compartira limite con otros usuarios.
- Si varios usuarios salen por la misma IP publica (empresa, VPN, Wi-Fi comun), podrian compartir limite igualmente.
- Aun asi, el modelo correcto sigue siendo usar el token propio de cada usuario y no uno central de la plataforma.

## Recomendacion tecnica

No hacer la app movil con `fetch` puro desde el WebView si queremos depender menos de CORS y controlar mejor cabeceras.

Recomendacion:

1. Usar `Capacitor` para Android e iOS.
2. Reutilizar `web/frontend` como base visual.
3. Usar almacenamiento seguro nativo para el token.
4. Usar cliente HTTP nativo en movil para las llamadas a Discogs.

## Arquitectura recomendada

### Se mantiene

- `Supabase` para login, perfiles, acceso, favoritos, escuchados y metricas.
- `billing-api` para Stripe checkout, portal y webhooks.
- `web/frontend` como base principal de interfaz.

### Cambia o se anade

- `Capacitor` para envolver la app web y generar proyectos Android/iOS.
- Capa de runtime movil para detectar plataforma y acceder a APIs nativas.
- Capa de almacenamiento seguro movil para el token de Discogs.
- Capa HTTP nativa para hablar con Discogs sin depender del `fetch` del WebView.

## Flujo deseado en movil

1. El usuario instala la app.
2. Inicia sesion con Supabase.
3. Va a `Settings`.
4. Introduce su token de Discogs.
5. La app guarda ese token de forma segura en el dispositivo.
6. Cuando lanza una busqueda, la app usa ese token para consultar Discogs directamente.
7. Los resultados, favoritos, escuchados y metricas se siguen guardando en Supabase.

## Por que no usar el proxy central

No es recomendable para el caso de uso final porque:

- compartirias la cuota entre usuarios.
- expones mas tu infraestructura.
- generas un cuello de botella en tu backend.
- te obliga a gestionar mas observabilidad y anti abuso.

## Implementacion por fases

## Fase 1 - Preparar el frontend para reutilizarse en movil

### 1. Revisar que la UI sea realmente movil

Comprobar y adaptar:

- login
- billing
- settings
- search
- favoritos
- escuchados

Objetivo:

- que toda la navegacion funcione bien en pantalla pequena.
- evitar layouts solo pensados para desktop ancho.

### 2. Aislar dependencias de runtime

Ahora la app ya diferencia web/desktop en varias partes. Para movil conviene formalizarlo.

Crear una capa tipo:

- `lib/runtime/platform.ts`
- `lib/runtime/secure-token.ts`
- `lib/runtime/http.ts`

Con una interfaz comun como esta:

```ts
export type SecureTokenDriver = {
  load(userId: string): Promise<string>;
  save(userId: string, token: string): Promise<void>;
  remove(userId: string): Promise<void>;
};

export type HttpDriver = {
  get(url: string, options?: { headers?: Record<string, string> }): Promise<{ status: number; data: unknown; headers: Record<string, string> }>;
};
```

Implementaciones previstas:

- web: sin soporte real de busqueda
- desktop: Tauri
- mobile: Capacitor

## Fase 2 - Anadir Capacitor

Desde `web/frontend`:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
```

Recomendacion de identificador:

- Android/iOS bundle id: `com.103finder.mobile`

Anadir plataformas:

```bash
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
```

Cada vez que generes web y quieras sincronizar:

```bash
npm run build
npx cap sync
```

Abrir proyectos nativos:

```bash
npx cap open android
npx cap open ios
```

## Fase 3 - Almacenamiento seguro del token

En movil no sirve el keyring de Tauri. Hay que reemplazarlo por almacenamiento seguro nativo.

Opciones tipicas:

- plugin de secure storage para Capacitor
- iOS Keychain
- Android Keystore

Requisito funcional:

- el token debe guardarse por `user_id`, igual que en desktop.

Clave sugerida:

```text
discogs-token:<user_id>
```

### API objetivo

La API de frontend deberia quedar igual que ahora, solo cambiando la implementacion interna:

```ts
await saveDiscogsToken(userId, token)
const state = await loadDiscogsToken(userId)
await deleteDiscogsToken(userId)
```

## Fase 4 - Cliente HTTP nativo para Discogs

### Por que

Aunque Discogs muestra `Access-Control-Allow-Origin: *` en parte de la documentacion, conviene no depender del `fetch` del WebView para una app movil real.

Motivos:

- mejor control de cabeceras
- mejor control de errores de red
- menos dependencia del comportamiento CORS del WebView
- mejor control del `User-Agent`

### Requisito importante

Discogs pide un `User-Agent` identificable.

Usar algo consistente como:

```text
103FinderMobile/1.0 (+https://www.103finder.shop)
```

### Cabeceras recomendadas

```text
Authorization: Discogs token=<TOKEN_DEL_USUARIO>
User-Agent: 103FinderMobile/1.0 (+https://www.103finder.shop)
Accept: application/vnd.discogs.v2.discogs+json
```

## Fase 5 - Reutilizar el motor de busqueda

### Situacion actual

Ahora la busqueda real de desktop esta muy ligada a Tauri/Rust.

Para movil hay dos caminos:

### Opcion A - Reimplementar la busqueda en TypeScript para movil

Ventajas:

- mas rapido de sacar
- menos complejidad al principio

Inconvenientes:

- duplicas parte de la logica

### Opcion B - Llevar el motor de busqueda a una capa compartida

Ideal a medio plazo:

- separar la logica de filtros y evaluacion
- dejar la plataforma solo para IO (token, red, eventos)

Mi recomendacion:

- empezar con una version movil funcional en TypeScript
- despues extraer logica comun si hace falta

## Fase 6 - Mantener reglas de producto

La regla debe seguir siendo:

- web publica: sin busqueda real
- desktop: busqueda con token local del usuario
- movil: busqueda con token local del usuario

Nunca:

- usar tu token personal central para todos
- exponer un proxy de Discogs abierto a usuarios finales

## Fase 7 - Billing y retorno desde Stripe

### Lo que ya puedes reutilizar

- login con Supabase
- `/billing`
- `billing-api`
- webhooks Stripe

### Lo que hay que revisar en movil

- retorno del checkout a la app
- deep links o universal links

Recomendacion:

- primero usar retorno a URL web publica funcional
- despues mejorar a deep links nativos

## Fase 8 - Publicacion Android / iPhone

### Android

- abrir proyecto en Android Studio
- configurar iconos, nombre, version y firma
- generar `.aab` para Play Store

### iPhone

- abrir proyecto en Xcode
- configurar bundle id
- firmar con Apple Developer
- subir via TestFlight

## Riesgos y notas operativas

### 1. Rate limit de Discogs

- sigue siendo por IP
- no puedes garantizar aislamiento perfecto por usuario
- pero el modelo movil con token local evita compartir tu token central

### 2. Seguridad del token

- guardarlo en storage seguro
- nunca en localStorage ni texto plano

### 3. App Store / Play Store

- revisa que el flujo de pago y suscripcion cumpla politicas de store si luego integras compras in-app
- si el pago externo es solo gestion de cuenta SaaS, hay que revisar politicas segun el modelo final

### 4. Observabilidad

- mantener metricas y errores de login, billing y busqueda
- loggear solo lo necesario
- nunca guardar tokens Discogs en logs

## Checklist tecnico resumido

### Preparacion

- [ ] Hacer UI movil de `web/frontend`
- [ ] Extraer capa runtime comun
- [ ] Definir storage seguro movil
- [ ] Definir cliente HTTP nativo movil

### Capacitor

- [ ] Inicializar Capacitor
- [ ] Anadir Android
- [ ] Anadir iOS
- [ ] Configurar sync/build

### Token y busqueda

- [ ] Guardar token por `user_id`
- [ ] Implementar requests a Discogs con token del usuario
- [ ] Anadir `User-Agent` propio
- [ ] Probar limites y errores de red

### Distribucion

- [ ] Build Android
- [ ] Build iOS
- [ ] Firma Android
- [ ] Firma y notarizacion iOS

## Recomendacion final

El orden mas rentable es:

1. cerrar bien desktop y web
2. crear version Android primero con Capacitor
3. validar token local + busqueda real en Android
4. despues portar a iPhone

Android suele ser la via mas rapida para validar el enfoque tecnico y de producto antes de invertir en la parte mas delicada de iOS.

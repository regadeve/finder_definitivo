# Contexto de la tarea: busqueda desktop con catalogo local + modo hibrido

## Contexto general

- Proyecto: `PROJECT_3_4`
- App principal relevante en esta tarea: desktop app Tauri + Next.js dentro de `web/frontend`
- Objetivo principal de esta sesion: dejar de depender tanto de Discogs live para busquedas y aprovechar la base local `discogs_catalog`, sin romper el buscador antiguo
- Tambien aparecio en paralelo un problema de dominio/suspension en `103finder.shop` y en la `Billing API`, pero la parte central del trabajo termino siendo la busqueda desktop con catalogo local + modo hibrido

## Problema inicial de negocio

Se queria que la app desktop no consultara siempre a Discogs para datos estaticos. La idea era usar la base local `discogs_catalog` para:

- filtrar mas rapido
- reducir llamadas a Discogs
- evitar rate limit
- mantener el buscador actual como plan B

Se pidio explicitamente hacerlo en una version nueva, sin romper lo que ya habia.

## Arquitectura anterior

Antes de estos cambios, la busqueda desktop usaba Discogs live desde Tauri/Rust:

- el frontend React/Next enviaba filtros a Tauri
- Tauri hacia busqueda base en Discogs
- por cada resultado hacia llamadas de detalle por release
- el filtrado se completaba despues

Ese flujo antiguo se dejo intacto y sigue existiendo como motor:

- `Discogs live`

## Objetivo tecnico acordado

Se decidio crear 3 motores de busqueda separados:

### 1. `Discogs live`

- motor antiguo
- todo desde Discogs
- se dejo intacto

### 2. `Catalogo local`

- todo sale de PostgreSQL local (`discogs_catalog`)
- no llama a Discogs

### 3. `Catalogo + live`

- primero prefiltra con `discogs_catalog`
- luego pide detalles live a Discogs para los candidatos
- los resultados deben ir apareciendo progresivamente

## Cambios principales hechos

### 1. Nuevo soporte de catalogo local en Tauri

Se anadio conexion a PostgreSQL desde la app desktop usando `tokio-postgres`.

Archivos clave:

- `web/frontend/src-tauri/Cargo.toml`
- `web/frontend/src-tauri/src/lib.rs`

Se anadieron:

- guardado seguro del DSN del catalogo en keyring
- carga/borrado del DSN
- motor `start_catalog_search`
- motor `start_hybrid_search`

### 2. Nueva configuracion de DSN local

Se anadio una seccion en `Settings` para guardar la conexion a `discogs_catalog`.

Archivos:

- `web/frontend/app/(main)/settings/page.tsx`
- `web/frontend/lib/desktop/catalog-config.ts`

DSN usado durante las pruebas:

```text
postgresql://discogs_app:Nesca5859!@localhost:5432/discogs_catalog
```

### 3. Selector de motor en Search

Se anadio selector visual en la pantalla de busqueda.

Archivos:

- `web/frontend/app/(main)/search/SearchClient.tsx`
- `web/frontend/lib/search/backend.ts`

Motores visibles ahora:

- `Discogs live`
- `Catalogo local`
- `Catalogo + live`

### 4. Integracion del stream de busqueda

Se amplio el stream para soportar varios backends.

Archivos:

- `web/frontend/lib/discogs/search-stream.ts`
- `web/frontend/lib/search/session.ts`

### 5. Releases desktop manuales

Se generaron builds nuevas porque la release publica no tenia estos cambios.

Versiones trabajadas:

- `0.1.4`
- `0.1.5`

Archivos de version actualizados:

- `web/frontend/package.json`
- `web/frontend/package-lock.json`
- `web/frontend/src-tauri/tauri.conf.json`
- `web/frontend/src-tauri/Cargo.toml`

## Evolucion de errores y fixes

### Fase 1: la app publicada no tenia los cambios

Se actualizo desde el updater y se vio que la version instalada no mostraba el selector `Motor`.

Conclusion:

- la release publica aun no incluia los cambios locales

Solucion aplicada:

- se genero un instalador manual nuevo

### Fase 2: problema con firma del updater

El build release si generaba el `.exe` y `.msi`, pero fallaba la firma para updater porque faltaba:

- `TAURI_SIGNING_PRIVATE_KEY`

Luego se localizo la clave:

- `C:\Users\deves\.tauri\103finder-updater.key`

Tambien se vio que esa clave esta cifrada y requiere password.

Se probaron:

- contrasena vacia
- `Nesca5859!`
- el bloque base64 pegado por error

Ninguna funciono.

Conclusion:

- no se pudo publicar el updater firmado
- si se pudo seguir distribuyendo manualmente el instalador

### Fase 3: primer fallo del catalogo local

Error que aparecio:

- `La consulta estructural del catalogo fallo: db error`

Investigacion:

- se comprobo que la base si existia y el esquema `catalog` estaba creado
- tambien estaban las tablas importantes:
  - `catalog.releases`
  - `catalog.release_genres`
  - `catalog.release_styles`
  - `catalog.release_formats`
  - `catalog.release_format_descriptions`
  - `catalog.release_videos`
  - `catalog.release_labels`
  - `catalog.master_version_counts`

Se mejoro el diagnostico:

- ahora los errores SQL muestran mas detalle
- ademas muestran resumen de filtros activos

### Fase 4: error de sintaxis SQL

Error real detectado despues:

- `error de sintaxis en o cerca de "SELECTr"`

Causa:

- la query SQL se construia concatenando texto de una forma que pegaba tokens mal

Fix:

- se reescribio la generacion de SQL en formato multilinea mas estable
- archivo principal: `web/frontend/src-tauri/src/lib.rs`

### Fase 5: 0 resultados en busquedas que deberian dar muchos

Caso concreto:

- busqueda 1995 + Electronic + EBM
- devolvia `0`

Investigacion directa contra PostgreSQL:

- `catalog.release_styles` si tenia muchas filas con `EBM`
- `catalog.releases` tenia millones de releases
- pero el campo `year` estaba vacio para todo
- el campo `released` si venia relleno muchas veces con anos/fechas

Causa:

- el motor local filtraba por `r.year`
- pero en el dump/import ese campo estaba sin poblar
- por eso cualquier filtro por ano daba cero

Fix:

- se anadio un `effective_year`
- logica:
  - usar `r.year` si existe y no es 0
  - si no, derivar el ano desde `r.released`

Ese `effective_year` se usa para:

- filtrar por ano
- ordenar
- mostrar ano en resultados del catalogo

### Fase 6: lentitud del catalogo / resultados progresivos

Se pidio explicitamente:

- que no esperase a tener todo el catalogo resuelto
- que fueran saliendo resultados a medida que se encuentran
- especialmente en `Catalogo + live`

Antes:

- el motor cargaba demasiados resultados de golpe
- luego procesaba
- percepcion de lentitud alta

Fix:

- ambos motores de catalogo se cambiaron a procesamiento por lotes
- se anadio:
  - `CATALOG_BATCH_SIZE = 250`

El motor `Catalogo local` ahora:

- consulta en batches
- emite `item` segun encuentra
- actualiza `status` por lote

El motor `Catalogo + live` ahora:

- pide lote al catalogo
- empieza a pedir detalles live a Discogs inmediatamente
- va emitiendo resultados segun pasan el filtro final

### Fase 7: en modo hibrido no salian imagenes

Problema:

- `Catalogo + live` mostraba resultados pero sin thumbs de release

Causa:

- `build_card(...)` tomaba el `thumb` solo del item base del catalogo
- algunos items del catalogo venian sin `thumb`
- no aprovechaba bien la info del detalle live de Discogs

Fix:

- se anadio fallback para imagen en `build_card(...)`
- nuevo orden:
  - `details.thumb`
  - `details.cover_image`
  - `details.images[].uri150`
  - `details.images[].uri`
  - y si no, el `item.thumb` del catalogo

Resultado:

- ahora en `Catalogo + live` si aparecen las imagenes correctamente

## Estado funcional al final de la sesion

### Lo que si funciona

- `Discogs live` sigue funcionando como motor antiguo
- `Catalogo local` ya consulta PostgreSQL local
- `Catalogo + live` ya:
  - prefiltra por catalogo
  - pide detalles a Discogs
  - muestra resultados progresivamente
  - muestra imagenes
- el selector `Motor` existe en Search
- la conexion DSN local existe en Settings
- la build desktop nueva arranca desde:
  - `web/frontend/src-tauri/target/release/finder_103_desktop.exe`

### Lo que quedo pendiente

- no se pudo firmar/publicar el updater automatico
- motivo:
  - falta la contrasena correcta de `C:\Users\deves\.tauri\103finder-updater.key`
- se puede seguir distribuyendo manualmente con instalador `.exe`

## Builds relevantes generadas

### `0.1.4`

Introdujo:

- motor `Catalogo local`
- motor `Catalogo + live`

### `0.1.5`

Anadio:

- mejor diagnostico SQL
- arreglo de SQL mal construida
- derivacion de ano desde `released`
- streaming progresivo por lotes
- arreglo de imagenes del modo hibrido

Instalador manual actual:

- `web/frontend/src-tauri/target/release/bundle/nsis/103 Finder_0.1.5_x64-setup.exe`

Ejecutable local actual:

- `web/frontend/src-tauri/target/release/finder_103_desktop.exe`

## Detalles tecnicos importantes para retomar luego

### Base de datos

- Base: `discogs_catalog`
- Usuario probado: `discogs_app`
- Password de ese usuario de Postgres usada en pruebas: `Nesca5859!`
- DSN usado:

```text
postgresql://discogs_app:Nesca5859!@localhost:5432/discogs_catalog
```

### Esquema relevante

- `catalog.releases`
- `catalog.release_genres`
- `catalog.release_styles`
- `catalog.release_formats`
- `catalog.release_format_descriptions`
- `catalog.release_videos`
- `catalog.release_labels`
- `catalog.master_version_counts`
- `catalog.masters`

### Observacion muy importante del catalogo

- `catalog.releases.year` esta vacio en la practica
- `catalog.releases.released` si contiene mucha informacion util
- por eso el fallback `effective_year` es imprescindible

## Archivos mas tocados en esta tarea

- `web/frontend/src-tauri/src/lib.rs`
- `web/frontend/src-tauri/Cargo.toml`
- `web/frontend/src-tauri/tauri.conf.json`
- `web/frontend/app/(main)/search/SearchClient.tsx`
- `web/frontend/app/(main)/settings/page.tsx`
- `web/frontend/lib/discogs/search-stream.ts`
- `web/frontend/lib/search/session.ts`
- `web/frontend/lib/search/backend.ts`
- `web/frontend/lib/desktop/catalog-config.ts`
- `web/frontend/package.json`
- `web/frontend/package-lock.json`

## Tema del updater / firma

- Clave privada localizada:
  - `C:\Users\deves\.tauri\103finder-updater.key`
- Clave publica:
  - `C:\Users\deves\.tauri\103finder-updater.key.pub`
- Script existente:
  - `web/frontend/scripts/run-signed-build.ps1`
- Otro script:
  - `web/frontend/scripts/sign.js`
- El problema es la password de esa clave privada
- No se encontro en el sistema durante esta sesion
- `Nesca5859!` no sirve para esa clave
- el bloque base64 largo que aparecio es el contenido de la key, no la password

## Tema del dominio y billing que tambien aparecio

Aunque no fue el foco final, conviene recordar esto:

- El error del `.exe` al crear cuenta era:
  - `No se pudo conectar con Billing API en https://api.103finder.shop`
- Se comprobo que:
  - el backend Railway arrancaba bien
  - el dominio estaba suspendido por verificacion Whois en Namecheap
- Se detecto que eso afectaba a:
  - `www.103finder.shop`
  - `app.103finder.shop`
  - `api.103finder.shop`
- Se verifico el email del registrante
- Se corrigio configuracion DNS para `api`
- Tambien se mitigó el frontend para que si Billing cae:
  - la creacion de cuenta no parezca fallida
  - se muestre mensaje mas claro

Archivos tocados en esa parte:

- `web/frontend/lib/billing/api.ts`
- `web/frontend/components/auth/AuthShell.tsx`
- `web/frontend/app/billing/page.tsx`

## Que problemas quedaron resueltos

- El buscador antiguo se conserva
- Hay motor local separado
- Hay motor hibrido separado
- Ya no hay dependencia total de Discogs live
- Ya no se rompe todo por el campo `year` vacio
- La query SQL del catalogo ya no tiene el error de sintaxis
- El modo hibrido ya muestra imagenes
- Los resultados pueden ir apareciendo progresivamente

## Que comprobar la proxima vez que se retome

1. Que `Catalogo local` devuelva resultados coherentes con distintos filtros
2. Que `Catalogo + live` mantenga velocidad razonable con busquedas grandes
3. Si merece la pena paralelizar llamadas live a Discogs con un pequeno limite de concurrencia
4. Si conviene hacer `Catalogo + live` el motor por defecto cuando haya DSN configurado
5. Si se quiere publicar updates reales, recuperar la password correcta de la clave Tauri
6. Revisar si algunos filtros dinamicos deberian quedarse solo live:
   - `have`
   - `want`
   - `num_for_sale`
   - `lowest_price`
7. Valorar cache local de detalles live para acelerar aun mas el modo hibrido

## Recomendacion para retomar despues

Si mas adelante se vuelve a esta tarea, el orden bueno seria:

1. Probar `Catalogo local`
2. Probar `Catalogo + live`
3. Medir tiempos de primera aparicion de resultados
4. Revisar si falta concurrencia en el paso live
5. Recuperar o rotar la clave del updater
6. Publicar una release estable nueva

## Resumen corto final

- Se creo una arquitectura de 3 motores de busqueda.
- El antiguo no se rompio.
- El catalogo local ya funciona.
- El modo hibrido ya funciona, saca resultados progresivos y muestra imagenes.
- Se detecto y arreglo un bug serio con el ano porque el catalogo no tenia `year` poblado.
- Se detecto y arreglo un bug serio de SQL mal concatenada.
- La distribucion por updater quedo bloqueada solo por la password perdida de la clave de firma.
- La distribucion manual por `.exe` si quedo operativa.

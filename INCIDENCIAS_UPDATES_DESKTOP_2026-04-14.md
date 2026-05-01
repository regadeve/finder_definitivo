# Incidencias Updates Desktop - 2026-04-14

## Contexto

Este documento deja por escrito las regresiones detectadas en `project_3_4` alrededor del updater desktop, la busqueda local de Discogs y el flujo de release. Tambien deja el fix aplicado hoy y la forma de verificarlo.

## Cambios aplicados hoy

- `web/frontend/scripts/publish-updater.mjs`
  - deja de reutilizar `103-Finder-Windows-x64-Setup.exe`
  - publica instaladores versionados, por ejemplo `103-Finder-Windows-x64-Setup-0.1.2.exe`
  - mantiene `latest.json` como manifiesto estable
- `public-landing/next.config.ts`
  - `latest.json` pasa a servirse con `Cache-Control: no-store`
  - los `.exe` y `.sig` versionados pasan a servirse con cache larga e `immutable`
- `web/frontend/src-tauri/src/lib.rs`
  - `check_app_update` ya no marca todo como obligatorio por defecto
  - lee y valida `required` y `minimum_version` desde `latest.json`
  - expone diagnostico claro en la UI
  - añade timeouts y mensajes mas claros en la busqueda local
- `web/frontend/app/(main)/settings/page.tsx`
  - muestra version instalada, version detectada, minimo exigido y diagnostico del updater
- `web/frontend/components/desktop-update-notice.tsx`
  - mejora el aviso de update opcional/obligatoria
- `web/frontend/lib/discogs/search-stream.ts`
  - añade watchdog para detectar busquedas que se quedan sin eventos
- `web/frontend/lib/search/session.ts`
  - deja visible el error real en lugar de un fallo generico

## Problema 1: el update instala una build vieja y "desaparecen" filtros

### Por que pasa

El instalador publicado se reutilizaba siempre con el mismo nombre fijo. Si la CDN, el navegador o el propio sistema cliente cacheaban ese `.exe`, el updater o la landing podian terminar sirviendo un binario viejo aunque `latest.json` indicara una release nueva. Eso provocaba la sensacion de que filtros como `Want`, `Excluir Various`, `Not On Label` o `White Label` habian desaparecido, cuando en realidad se estaba reinstalando una build antigua.

### Como detectarlo

- `latest.json` apunta a una version nueva, pero el usuario sigue viendo comportamiento de una build previa.
- El instalador descargado conserva siempre el mismo nombre.
- La version mostrada dentro de la app no coincide con la version detectada por el updater.

### Solucion tecnica

- Publicar cada release con nombre versionado.
- Mantener `latest.json` estable como puntero.
- Hacer `latest.json` no-cacheable.
- Hacer los binarios versionados cacheables a largo plazo.
- Eliminar de la landing los binarios legacy con nombre fijo para no volver a enlazarlos por error.

### Verificacion posterior

- Revisar `public-landing/public/updates/latest.json`.
- Confirmar que `download_path` apunta a un `.exe` versionado.
- Confirmar que `platforms.windows-x86_64.url` apunta a un `.exe` versionado.
- Confirmar que en Settings la app muestra `Instalada` y `Detectada` con valores coherentes.

## Problema 2: el update bloqueaba navegacion o dejaba rutas raras

### Causa

Parte del frontend venia usando rutas literales mezcladas con estado persistido. Eso podia dejar redirecciones o restauraciones de filtros menos consistentes entre builds.

### Fix aplicado

- Se consolido el uso de `appRoutes` en puntos sensibles de Settings y Search.
- El flujo de update ahora deja mas visible la version real activa y la version detectada para diagnosticar desalineaciones rapido.

### Como comprobarlo

- Abrir la app instalada.
- Ir a Perfil, Buscar, volver y reutilizar una busqueda guardada.
- Confirmar que navega a la ruta esperada y que los filtros cargan sin rutas raras.

## Problema 3: la busqueda se queda pensando y no arranca

### Causas probables

- token invalido o no autorizado en Discogs
- timeout de red
- rate limit `429`
- build vieja sin los eventos esperados
- carrera entre el inicio de la busqueda y la recepcion del primer evento

### Logs y puntos a revisar

- mensaje visible en el estado del stream dentro de Search
- salida de Tauri/Rust si se ejecuta la app desde terminal
- respuesta de Discogs si devuelve `401`, `403` o `429`

### Solucion y fallback

- el cliente desktop ahora acepta el primer evento aunque llegue antes de terminar de fijar el `searchId`
- se añade watchdog si no llega ningun evento inicial
- se añade watchdog si la busqueda deja de emitir eventos durante demasiado tiempo
- `discogs_get` devuelve mensajes concretos para `401`, `403`, timeout y `429`
- la UI ya muestra el error real en el estado del stream

### Como comprobarlo

- Probar con token invalido y confirmar mensaje `401`.
- Probar con red lenta o cortada y confirmar mensaje de timeout.
- Repetir varias busquedas seguidas y confirmar mensaje de rate limit si Discogs lo devuelve.
- Probar una busqueda normal y confirmar que ya no se queda indefinidamente en `Buscando...` sin explicacion.

## Problema 4: usuario borrado en `profiles` pero sigue `already registered`

### Explicacion

En Supabase, `profiles` no es la fuente de verdad de autenticacion. Si borras solo la fila de `profiles`, el usuario sigue existiendo en `auth.users`. Por eso el email puede seguir devolviendo `already registered`.

### Limpieza correcta

1. identificar el usuario en `auth.users`
2. borrar datos dependientes si existen
3. borrar la fila de `profiles`
4. borrar el usuario de `auth.users` desde el panel o con una funcion segura de admin

### SQL orientativo de comprobacion

```sql
select id, email, created_at
from auth.users
where email = 'usuario@ejemplo.com';

select id, email, full_name
from public.profiles
where email = 'usuario@ejemplo.com';
```

### Checklist

- revisar `auth.users`
- revisar `public.profiles`
- revisar tablas relacionadas por `user_id`
- borrar el usuario en Auth, no solo en `profiles`
- volver a intentar el registro

## Problema 5: buenas practicas de release desktop

### Motivo real de las regresiones

La regresion no venia de un unico punto. Era la combinacion de:

- binario viejo cacheado
- reutilizacion del mismo nombre de instalador
- `latest.json` susceptible de cache
- desalineacion entre landing, manifiesto y binario servido

### Orden correcto de release

1. subir version en frontend y Tauri
2. compilar la app desktop con firma de updater
3. publicar artefactos versionados con `npm run desktop:publish-updater`
4. desplegar `public-landing`
5. comprobar `latest.json` publicado en el dominio final
6. comprobar descarga directa del `.exe` versionado
7. probar update desde una build anterior instalada

### Que no hacer

- no reutilizar siempre el mismo nombre de instalador
- no cachear `latest.json`
- no asumir que borrar `profiles` elimina un usuario de Auth
- no validar la release solo mirando la landing; hay que comprobar tambien `latest.json` y el instalador real

### Como validar que la release publicada es la buena

- abrir `https://103finder.shop/updates/latest.json`
- confirmar `version`, `required`, `minimum_version` y la URL versionada
- descargar el instalador enlazado desde `latest.json`
- abrir la app instalada y comprobar la version en Settings
- lanzar `Buscar actualizaciones` desde una build anterior y verificar que detecta la version correcta

## Checklist post-release

- `npm run desktop:build`
- `npm run desktop:publish-updater`
- desplegar `public-landing`
- verificar cabecera `Cache-Control` de `latest.json`
- verificar cabecera `Cache-Control` de los `.exe` y `.sig`
- verificar `latest.json` en produccion
- instalar desde cero la build publicada
- probar update desde una build anterior
- comprobar filtros `Want`, `Excluir Various`, `Not On Label` y formato `White Label`
- probar una busqueda con token correcto y otra con token invalido

## Verificacion ejecutada hoy

- `cargo check` en `web/frontend/src-tauri`: OK
- `npm run build` en `public-landing`: OK
- `npm run build` en `web/frontend`: OK
- `npm run desktop:build`: compilo binarios; la primera ejecucion fallo por no tener `TAURI_SIGNING_PRIVATE_KEY` en entorno
- `npm run desktop:publish-updater`: OK despues de disponer del `.sig` generado por la build firmada

## Nota operativa

Si `public-landing` se desplegara algun dia como export estatico puro fuera de Vercel/Next server, los headers de cache habria que replicarlos en el CDN o reverse proxy. El fix de hoy asume despliegue con soporte real de headers HTTP.

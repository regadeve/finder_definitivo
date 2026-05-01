# Como he publicado la nueva version del programa - 2026-04-14

## Objetivo

Dejar publicada la version correcta de la app desktop para que:

- los usuarios puedan descargarla desde la web publica
- el updater de Tauri detecte la release correcta
- no se vuelva a instalar un binario viejo por culpa de cache o nombre fijo

## Version publicada

- Version: `0.1.2`
- App: `103 Finder`
- Dominio publico: `https://103finder.shop`

## Paso 1. Verificar que la build correcta era la actual

Primero comprobé que la app desktop que teniamos abierta y validada era la buena.

- Se lanzó el ejecutable desktop compilado localmente.
- Se revisó que la version activa era `0.1.2`.
- Se comprobó por codigo que esta build conserva los filtros importantes:
  - `Have min` / `Have max`
  - `Want min` / `Want max`
  - `Solo Not On Label`
  - `Excluir Various`
  - `White Label`

Conclusion: la build `0.1.2` era apta para publicar.

## Paso 2. Corregir el sistema de publicacion del updater

Antes de publicar, se corrigio el flujo para evitar que el updater siguiera usando siempre el mismo instalador.

### Cambio aplicado

En `web/frontend/scripts/publish-updater.mjs` se cambio la salida para que cada release publique un instalador versionado.

Antes:

- `103-Finder-Windows-x64-Setup.exe`

Ahora:

- `103-Finder-Windows-x64-Setup-0.1.2.exe`

Con esto se evita que una CDN o el cliente reutilicen un `.exe` viejo con el mismo nombre.

## Paso 3. Generar y publicar los artefactos del updater

Una vez validada la build, se ejecutaron los procesos de build y publicacion del updater.

### Build desktop

Se ejecuto:

```bash
npm run desktop:build
```

Resultado:

- se genero el ejecutable desktop
- se genero el instalador NSIS
- se genero la firma `.sig` necesaria para el updater

Durante la primera ejecucion aparecio una incidencia:

- faltaba `TAURI_SIGNING_PRIVATE_KEY` en entorno para firmar correctamente el updater

Una vez disponible la firma correcta, se pudo continuar con la publicacion.

### Publicacion del updater

Se ejecuto:

```bash
npm run desktop:publish-updater
```

Ese paso copio a la landing publica:

- `public-landing/public/updates/latest.json`
- `public-landing/public/updates/103-Finder-Windows-x64-Setup-0.1.2.exe`
- `public-landing/public/updates/103-Finder-Windows-x64-Setup-0.1.2.exe.sig`
- `public-landing/public/downloads/103-Finder-Windows-x64-Setup-0.1.2.exe`

## Paso 4. Actualizar el manifiesto publico `latest.json`

Se revisó el contenido final de `public-landing/public/updates/latest.json`.

Quedó publicado con estos valores clave:

- `version: 0.1.2`
- `required: true`
- `minimum_version: 0.1.2`
- `download_path: /downloads/103-Finder-Windows-x64-Setup-0.1.2.exe`
- `platforms.windows-x86_64.url: https://103finder.shop/updates/103-Finder-Windows-x64-Setup-0.1.2.exe`

Esto es lo que usa Tauri para detectar la nueva version y descargar el instalador correcto.

## Paso 5. Eliminar referencias legacy al instalador fijo

Se limpiaron los archivos heredados con nombre fijo para que no siguieran sirviendose por error.

Se eliminaron:

- `public-landing/public/updates/103-Finder-Windows-x64-Setup.exe`
- `public-landing/public/updates/103-Finder-Windows-x64-Setup.exe.sig`
- `public-landing/public/downloads/103-Finder-Windows-x64-Setup.exe`

Asi se evita que la landing o el updater vuelvan a enlazar el instalador antiguo.

## Paso 6. Ajustar la web publica para servir la release correcta

Se dejo preparada la landing publica para que el boton de descarga siempre lea la release actual desde `latest.json`.

Cambios principales:

- `public-landing/app/page.tsx`
  - lee `public/updates/latest.json`
  - muestra la version publicada en la home
  - enlaza automaticamente al instalador vigente
- `public-landing/next.config.ts`
  - `latest.json` se sirve con `Cache-Control: no-store`
  - los artefactos `.exe` y `.sig` se preparan con cache larga

## Paso 7. Hacer commit solo en el repo de la landing publica

Como el repo principal `project_3_4` tenia muchos cambios mezclados y ajenos, no se subio todo ese estado.

Para publicar solo la app, se trabajó sobre el repo independiente de la landing:

- carpeta: `public-landing`
- remoto: `https://github.com/regadeve/103finder-public-landing.git`
- rama: `main`

Se hizo un commit con solo los cambios necesarios para la publicacion de la release:

- commit: `38258c7`
- mensaje: `publish desktop app 0.1.2 update`

## Paso 8. Subir la release al remoto publico

Se hizo push del repo de landing publica con:

```bash
git push origin main
```

Esto disparó el despliegue de la web publica en Vercel.

## Paso 9. Esperar propagacion y verificar en produccion

Despues del push, se esperó a que Vercel propagara la nueva version y se verificó el contenido publico real.

### Verificacion de la home

Se comprobó que `https://103finder.shop` ya mostraba:

- `v0.1.2`
- el texto nuevo de descarga
- el boton apuntando a la build vigente

### Verificacion del manifiesto

Se comprobó que:

```text
https://103finder.shop/updates/latest.json
```

ya devolvía la version nueva con URL versionada.

### Verificacion del instalador

Se comprobó que:

```text
https://103finder.shop/downloads/103-Finder-Windows-x64-Setup-0.1.2.exe
```

respondia correctamente en produccion.

## Paso 10. Resultado final

La version publicada ha quedado operativa para:

- descarga directa desde la landing publica
- deteccion por updater mediante `latest.json`
- instalacion de la build correcta `0.1.2`

## Archivos clave involucrados

- `web/frontend/scripts/publish-updater.mjs`
- `web/frontend/src-tauri/src/lib.rs`
- `public-landing/app/page.tsx`
- `public-landing/next.config.ts`
- `public-landing/public/updates/latest.json`

## URLs finales publicadas

- Landing: `https://103finder.shop`
- Manifiesto updater: `https://103finder.shop/updates/latest.json`
- Instalador publico: `https://103finder.shop/downloads/103-Finder-Windows-x64-Setup-0.1.2.exe`

## Resumen corto

La nueva version del programa se publicó validando primero que la build `0.1.2` era la correcta, generando el instalador firmado, publicando artefactos versionados, actualizando `latest.json`, eliminando el instalador fijo antiguo, subiendo la landing publica al repo correcto y verificando despues la salida final ya desplegada en `103finder.shop`.

# Revision de faltantes para dejar PROJECT_3_4 fino para produccion

## 1. Criticos

### 1.1 Consolidar billing en un solo backend

Ahora mismo hay logica de Stripe en:

- `api/main.py`
- `billing-api/main.py`

Falta decidir una unica fuente de verdad. La recomendacion es dejar `billing-api/` como unico backend de billing y retirar esa parte de `api/`.

Riesgo actual:

- variables duplicadas;
- endpoints duplicados;
- posibles desajustes entre webhook, portal y checkout.

### 1.2 Definir si `api/` sigue vivo o se apaga

El frontend ya apunta a desktop-first para la busqueda. Falta decidir:

- si `api/` sigue como fallback web real;
- o si se retira de produccion.

Riesgo actual:

- mantener un backend que igual ya no es parte del flujo principal;
- coste operativo innecesario;
- confusion de arquitectura.

### 1.3 Formalizar despliegues

No hay `Dockerfile` ni workflows CI/CD en el repo.

Falta:

- pipeline de build y deploy;
- checklist automatizado;
- versionado/release repetible.

Riesgo actual:

- dependencia fuerte de una maquina concreta;
- releases manuales fragiles;
- errores humanos en producción.

### 1.4 Verificar headers de seguridad reales

`web/frontend/next.config.ts` define headers, pero Next ya avisa que con `output: export` no se aplican automaticamente.

Falta:

- mover CSP y cabeceras al hosting/CDN/proxy;
- documentar la configuracion final de produccion.

## 2. Altos

### 2.1 Añadir tests automatizados

No aparecen tests reales en el repo.

Falta cubrir como minimo:

- filtros de busqueda;
- sync Stripe webhook;
- reglas de acceso;
- updater metadata;
- funciones criticas de Supabase.

### 2.2 Documentar entornos y dominios finales

Falta una tabla unica con:

- dominio app;
- dominio landing;
- dominio billing API;
- entorno Supabase;
- entorno Stripe;
- webhook final;
- CORS autorizados.

### 2.3 Completar variables example

`public-landing/.env.example` todavia incluye `NEXT_PUBLIC_APP_DOWNLOAD_URL`, pero el README dice que ya no depende de esa variable.

Falta alinear:

- README;
- `.env.example`;
- comportamiento real.

### 2.4 Revisar la pagina de billing de la landing

`public-landing/app/billing/page.tsx` deja claro que si `NEXT_PUBLIC_APP_BASE_URL` no esta bien configurado, la redireccion queda en estado incorrecto.

Falta:

- validar configuracion final en produccion;
- comprobar redireccion real tras Stripe.

## 3. Medios

### 3.1 Mejorar observabilidad

Hoy el trafico se observa sobre todo con tablas de Supabase.

Falta si quieres operacion mas madura:

- errores centralizados;
- logs estructurados;
- alertas de webhook fallido;
- analytics de producto;
- dashboard de salud de releases/updater.

### 3.2 Limpiar artefactos y estructura

En el repo hay:

- logs locales;
- `__pycache__`;
- binarios generados;
- un repo `billing-api/.git` anidado;
- codigo legacy retirado o parcialmente borrado.

Falta una limpieza de repo y una politica clara de que entra y que no entra en git.

### 3.3 Versionado y ownership

Falta definir:

- quien genera releases desktop;
- donde vive la clave del updater;
- quien despliega landing;
- quien rota claves Stripe/Supabase;
- quien revisa migraciones SQL.

## 4. Checklist recomendado para dejarlo bien

### Semana 1

- consolidar billing en `billing-api/`;
- decidir futuro de `api/`;
- limpiar repo y `.gitignore`;
- alinear env examples y README.

### Semana 2

- crear tests minimos criticos;
- crear pipeline CI para build y checks;
- documentar dominios/entornos finales;
- mover security headers al edge/hosting.

### Semana 3

- mejorar observabilidad;
- validar updater end-to-end;
- validar Stripe end-to-end con entorno real;
- cerrar runbook de incidencias.

## 5. Prioridad final

Si solo haces tres cosas ahora mismo, yo haria estas:

1. Unificar billing y retirar duplicidad.
2. Montar pipeline minimo de build/deploy.
3. Añadir tests a flujos de acceso, Stripe y updater.

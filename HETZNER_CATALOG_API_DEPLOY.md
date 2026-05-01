# Despliegue catalog API en Hetzner

## 1. Preparar codigo

```bash
git clone <repo> /opt/project_3_4
cd /opt/project_3_4
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt
```

## 2. Variables de entorno

Crea `api/.env`:

```env
DISCOGS_TOKEN=tu_token_servidor
DISCOGS_USER_AGENT=103Finder/1.0 (ops@tu-dominio.com)
CATALOG_DATABASE_URL=postgresql://discogs_app:TU_PASSWORD@127.0.0.1:5432/discogs_catalog
CORS_ALLOW_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
APP_BASE_URL=https://tu-dominio.com
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_PRICE_ID=...
STRIPE_WEBHOOK_SECRET=...
```

## 3. Arrancar uvicorn

Prueba manual:

```bash
cd /opt/project_3_4
source .venv/bin/activate
uvicorn api.main:app --host 127.0.0.1 --port 8000
```

## 4. Crear servicio systemd

Archivo `/etc/systemd/system/project34-api.service`:

```ini
[Unit]
Description=PROJECT_3_4 FastAPI
After=network.target

[Service]
User=root
WorkingDirectory=/opt/project_3_4
EnvironmentFile=/opt/project_3_4/api/.env
ExecStart=/opt/project_3_4/.venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Activar:

```bash
systemctl daemon-reload
systemctl enable project34-api
systemctl start project34-api
systemctl status project34-api
```

## 5. Configurar nginx

Archivo `/etc/nginx/sites-available/project34-api`:

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 600s;
    }
}
```

Activar:

```bash
ln -s /etc/nginx/sites-available/project34-api /etc/nginx/sites-enabled/project34-api
nginx -t
systemctl reload nginx
```

## 6. Probar salud y streaming

```bash
curl http://127.0.0.1:8000/health
curl -N -X POST "http://127.0.0.1:8000/catalog/search/stream?mode=catalog-local" -H "Content-Type: application/json" --data '{"year_start":1995,"year_end":1995,"have_min":0,"have_max":80,"want_min":0,"want_max":0,"max_versions":2,"countries_selected":[],"formats_selected":[],"type_selected":"Todos","genres":[],"styles":[],"strict_genre":false,"strict_style":false,"sin_anyo":false,"solo_en_venta":false,"precio_minimo":0,"precio_maximo":0,"max_copias_venta":0,"tope_resultados":10,"youtube_status":"Todos","not_on_label_only":false,"exclude_various":false}'
```

## 7. Seguridad minima

- Mantener PostgreSQL escuchando solo en `127.0.0.1`
- No abrir `5432` en firewall de Hetzner
- Exponer solo `80/443` con `nginx`
- Limitar `CORS_ALLOW_ORIGINS` a dominios reales
- Anadir HTTPS con Let's Encrypt cuando el dominio apunte al servidor

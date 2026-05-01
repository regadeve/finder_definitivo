-- Ejecutar conectado como superusuario de PostgreSQL.
-- Cambia la password antes de lanzarlo en tu maquina.

CREATE ROLE discogs_app WITH LOGIN PASSWORD 'Nesca5859!';
CREATE DATABASE discogs_catalog OWNER discogs_app;

\connect discogs_catalog

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE discogs_catalog TO discogs_app;
GRANT USAGE ON SCHEMA public TO discogs_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO discogs_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO discogs_app;

#!/bin/sh
set -e

# Entrypoint comun para dev y prod.
#
# Corre las migraciones ANTES de arrancar la app. Elige el mecanismo segun el
# entorno:
#   - PROD  (imagen compilada): existe dist/database/data-source.js -> usa el
#           CLI de typeorm sobre JS compilado. NO requiere ts-node ni src/.
#   - DEV   (codigo montado, hot-reload): no hay dist/ -> usa el script ts-node
#           `migration:run` (apunta a src/database/data-source.ts).
#
# La espera a que Postgres este listo la maneja el healthcheck de compose
# (depends_on: condition: service_healthy), por eso aqui no hacemos polling.

echo "[entrypoint] Ejecutando migraciones..."

if [ -f "dist/database/data-source.js" ]; then
  echo "[entrypoint] Modo produccion (dist/ compilado) -> migration:run:prod"
  npm run migration:run:prod
else
  echo "[entrypoint] Modo desarrollo (ts-node) -> migration:run"
  npm run migration:run
fi

echo "[entrypoint] Migraciones aplicadas. Arrancando la app: $*"
exec "$@"

#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Spouštím DB migrace..."
  cd /app/pg-scripts
  node run-migrations.js || echo "Migrace přeskočeny nebo již proběhly."
fi

cd /app/web
exec "$@"

#!/bin/sh
# Arranque del contenedor (Dokploy): aplica las migraciones pendientes de todos los
# tenants y después levanta la API. Así un despliegue nunca deja la API leyendo
# columnas que aún no existen en las BDs.
#
# RUN_MIGRATIONS_ON_START=false  → no migra al arrancar (p. ej. réplicas adicionales).
# MIGRATIONS_STRICT=true         → si algún tenant falla, la API no arranca.
#                                   Por defecto arranca igual y lo avisa en el log,
#                                   para no dejar sin servicio a todos los tenants.
# RUN_RBAC_SYNC_ON_START=false   → no agrega los permisos nuevos del seed al arrancar.
#                                   Por defecto sí (rbac-add-missing --apply): solo agrega
#                                   sub-acciones nuevas a master, tenants y roles base;
#                                   nunca quita permisos. Si falla, la API arranca igual.

if [ "${RUN_MIGRATIONS_ON_START:-true}" = "true" ]; then
  echo "[start] Aplicando migraciones de tenants..."
  if ! bun run src/scripts/migrate-tenants.ts; then
    if [ "${MIGRATIONS_STRICT:-false}" = "true" ]; then
      echo "[start] ❌ Falló la migración de algún tenant y MIGRATIONS_STRICT=true: la API no arranca."
      exit 1
    fi
    echo "[start] ⚠️ Falló la migración de algún tenant (ver resumen arriba). La API arranca igualmente."
  fi
fi

if [ "${RUN_RBAC_SYNC_ON_START:-true}" = "true" ]; then
  echo "[start] Agregando permisos nuevos (RBAC) a los tenants..."
  if ! bun run src/scripts/rbac-add-missing.ts --apply; then
    echo "[start] ⚠️ No se pudieron agregar los permisos nuevos (ver arriba). La API arranca igualmente."
  fi
fi

exec bun run src/index.ts

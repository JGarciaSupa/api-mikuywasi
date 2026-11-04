#!/bin/sh
# Arranque del contenedor (Dokploy). Antes de levantar la API ejecuta, en orden y sin intervención
# (src/scripts/deploy.ts), todo lo que un despliegue necesita:
#   1. migraciones de la BD master        2. migraciones de todos los tenants
#   3. permisos nuevos del seed (RBAC)    4. tareas de despliegue pendientes (src/deploy-tasks)
# Todo es incremental (solo lo pendiente). El resultado se ve en GET /health y, si se configura
# DEPLOY_ALERT_WEBHOOK_URL, cualquier fallo se avisa por webhook.
#
# RUN_MIGRATIONS_ON_START=false    → no migra al arrancar (p. ej. réplicas adicionales).
# RUN_RBAC_SYNC_ON_START=false     → no agrega los permisos nuevos (solo agrega; nunca quita).
# RUN_DEPLOY_TASKS_ON_START=false  → no ejecuta las tareas de despliegue.
# MIGRATIONS_STRICT=true           → si fallan las migraciones, la API no arranca.
#                                     Por defecto arranca igual y lo avisa (log, /health, webhook),
#                                     para no dejar sin servicio a todos los tenants.

if ! bun run src/scripts/deploy.ts; then
  echo "[start] ❌ El despliegue falló y MIGRATIONS_STRICT=true: la API no arranca."
  exit 1
fi

exec bun run src/index.ts

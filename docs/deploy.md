# Despliegue sin pasos manuales

Al arrancar el contenedor (`docker/start.sh` → `src/scripts/deploy.ts` → `src/deploy/runner.ts`) la API ejecuta,
en orden y solo lo pendiente:

1. **Migraciones master** (`drizzle/master`, registro en `drizzle.__drizzle_migrations`; transaccional).
2. **Migraciones de tenants** (`drizzle/tenant`, todos los tenants).
3. **Permisos nuevos** del seed (`rbac-add-missing --apply`: solo agrega, nunca quita).
4. **Tareas de despliegue** pendientes (`src/deploy-tasks`, registro en `master.deploy_tasks`; ver su README).

Después levanta la API. Si un paso falla, la API arranca igual (salvo `MIGRATIONS_STRICT=true` con migraciones fallidas).

## Ver el resultado
- `GET /health` (público): `ok` · `degraded` (falló un paso o Redis) · `down` (sin BD master, **503**). Es el healthcheck del contenedor.
- **Super Admin → Estado del despliegue** (`GET /api/master/deploy`): pasos, errores, tareas ejecutadas y pendientes.
- Opcional: `DEPLOY_ALERT_WEBHOOK_URL` (Slack, Discord, Google Chat) avisa cuando algo falla.

## Reintentar
Super Admin → Estado del despliegue → **Reintentar fallidos** o **Ejecutar todos los pasos** (`POST /api/master/deploy/retry`,
`{ mode: 'failed' | 'all' }`). Solo los 4 pasos de arriba, nunca comandos libres; uno a la vez (409 si hay otro), en segundo
plano y auditado (`DEPLOY_RETRY`).

## Variables
`RUN_MIGRATIONS_ON_START`, `RUN_RBAC_SYNC_ON_START`, `RUN_DEPLOY_TASKS_ON_START` (por defecto `true`), `MIGRATIONS_STRICT`
(por defecto `false`), `DEPLOY_ALERT_WEBHOOK_URL`, `DEPLOY_ALERT_ON_SUCCESS`, `DEPLOY_ENV_NAME`, `DEPLOY_STATUS_FILE`.

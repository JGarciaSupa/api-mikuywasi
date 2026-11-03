# Sincronización PRD → QAS

Solo para **QAS**. Copia **todos** los datos de un tenant de PRD a esta plataforma, desde el Super Admin ("Sincronizar desde PRD").

- **Actualizar QAS**: reemplaza los datos del tenant QAS con el mismo slug.
- **Clonar a QAS**: crea el tenant en esta master (registro, suscripción, BD con migraciones) y copia los datos.

Código: `src/core/master/{routes,controllers,services,validations}/prd-sync.*`. Todas las rutas exigen `super-admin`.

## Activación (variables de `api-qas` en Dokploy)

```
PRD_SYNC_ENABLED=true
PRD_SYNC_DB_HOST=<IP del servidor de PRD>
PRD_SYNC_DB_PORT=5432
PRD_SYNC_DB_USER=qas_sync_reader
PRD_SYNC_DB_PASSWORD=<contraseña>
PRD_SYNC_MASTER_DB=db_master
```

Usuario de solo lectura, creado una vez en el servidor de PRD:

```sql
CREATE ROLE qas_sync_reader LOGIN PASSWORD '<contraseña>';
GRANT pg_read_all_data TO qas_sync_reader;
```

**Nunca** activar en PRD. Además, la API se niega si su propia `DATABASE_URL` está en el mismo host y puerto que `PRD_SYNC_DB_HOST`, y si el servidor destino del tenant coincide con el de PRD.

## Qué hace

1. Lee de PRD con sesiones `default_transaction_read_only=on` y una transacción `REPEATABLE READ READ ONLY`.
2. Aplica las migraciones pendientes al tenant QAS.
3. En **una sola transacción** en QAS (si algo falla, QAS queda como estaba):
   - vacía y copia todas las tablas comunes (columnas presentes en ambos lados), excepto `refresh_tokens` (las sesiones de PRD no se copian);
   - repone la empresa del facturador configurada en QAS (`branches.facturador_empresa_id`, `fiscal_id`, `fiscal_name`; `tenant_configs.facturador_empresa_id`, `facturador_ruc`). Los ids de empresa de PRD nunca quedan en QAS;
   - traduce por código los ids de master guardados en el tenant (`permissions_catalog.master_sub_action_id`, `roles.master_role_id`);
   - copia las imágenes de R2 de `<slug-prd>/…` a `<slug-qas>-qas/…` (si ya existen, se reutilizan; si una falla, queda sin imagen).
4. Añade en master los grants del tenant de PRD (solo agrega, no revoca) y sincroniza `permissions_catalog`.
5. Registra la operación en `audit_logs` (`PRD_SYNC_REFRESH` / `PRD_SYNC_CLONE`).

Los usuarios y contraseñas pasan a ser los de PRD. Los comprobantes copiados conservan el `facturador_comprobante_id` de PRD: en QAS no sirven para reimprimir, reintentar ni emitir notas de crédito sobre ellos.

La copia corre en segundo plano (puede superar el timeout HTTP): el POST responde `202` con el trabajo y el panel consulta `/jobs/:jobId`. Solo puede correr una a la vez; los trabajos viven en memoria del proceso (se pierden al reiniciar).

## Endpoints (`/api/master/prd-sync`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/status` | `{ enabled, reason, running, jobs[] }`. Fuera de QAS, `enabled=false` con el motivo |
| GET | `/tenants` | Tenants de PRD: `{ slug, name, dbName, status, qasTenant: { id, name, dbName } \| null }` |
| GET | `/jobs/:jobId` | Estado de un trabajo |
| POST | `/tenants/:slug/update` | Body `{ confirmSlug }` (= `slug`). 202 con el trabajo · 400 si el tenant no existe en QAS o en PRD · 409 si hay otra en curso |
| POST | `/tenants/:slug/clone` | Body `{ confirmSlug, serverId, planId, billingCycle, planEndsAt?, name?, slug?, dbName? }` (por defecto nombre, slug y BD de PRD). 202 · 400 si el slug/BD ya existen · 409 si hay otra en curso |

Trabajo:

```json
{
  "id": "…", "mode": "refresh", "prdSlug": "wine-spirit-golf-asia", "qasSlug": "wine-spirit-golf-asia",
  "qasTenantId": 1, "status": "running | done | failed", "step": "Copiando datos de PRD",
  "startedAt": "…", "finishedAt": null, "message": null,
  "stats": { "tablesCopied": 80, "rowsCopied": 2295, "imagesCopied": 168, "imagesFailed": 0 },
  "warnings": ["Columnas de PRD que no existen en QAS (no se copian): …"]
}
```

Si la clonación falla se revierte todo: imágenes nuevas, BD creada y registros en master.

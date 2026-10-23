# Características de planes (catálogo)

Define las claves que se usan en `plans.features` para no escribirlas a mano en el super admin. El plan sigue guardando un objeto `{ clave: valor }` (por ejemplo `{ "maxProducts": 2000 }`), así que nada cambia para los consumidores.

Base: `/api/master/plan-features` · Auth: `masterAuthMiddleware` (super-admin).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Lista ordenada por `displayOrder`. Cada ítem trae `isEnforced` |
| POST | `/` | Crea. `key` opcional: si falta se genera desde `label` ("Máximo de sucursales" → `maximoDeSucursales`) |
| PATCH | `/:id` | Edita `label`, `description`, `unit`, `defaultValue`, `displayOrder`, `isActive`. **`key` y `valueType` no se editan** |
| DELETE | `/:id` | Elimina. 409 si la aplica el sistema o si algún plan la usa (desactívala en su lugar) |

**Campos:** `key`, `label`, `description`, `valueType` (`number` \| `boolean` \| `text`), `unit` (solo `number`), `defaultValue`, `displayOrder`, `isActive`, `isEnforced` (solo lectura).

**`isEnforced`:** `true` solo para claves que el código aplica (`ENFORCED_PLAN_FEATURE_KEYS` en `plan-features.service.ts`; hoy `maxProducts`, leído por `product-limit.service.ts`). Crear una característica nueva **no** hace que el sistema la aplique: cada límite real necesita su validación en la API.

**Planes:** `POST/PATCH /plans` valida que los valores de las claves registradas tengan el tipo correcto (número ≥ 0, Sí/No o texto). Las claves no registradas (planes antiguos) se aceptan sin validar.

Migración: `drizzle/master/0018_create_plan_feature_definitions.sql` (crea la tabla y siembra `maxProducts`).

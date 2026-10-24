# Características de planes (catálogo)

Define las claves que se usan en `plans.features` para no escribirlas a mano en el super admin. El plan sigue guardando un objeto `{ clave: valor }` (por ejemplo `{ "maxProducts": 2000 }`), así que nada cambia para los consumidores.

Base: `/api/master/plan-features` · Auth: `masterAuthMiddleware` (super-admin).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Lista ordenada por `displayOrder`. Cada ítem trae `isEnforced` |
| GET | `/supported` | Leyenda: límites que el sistema aplica (`key`, `label`, `unit`, `effect`, `valueType`, `inCatalog`) |
| POST | `/` | Crea. `key` opcional: si falta se genera desde `label` ("Máximo de sucursales" → `maximoDeSucursales`) |
| PATCH | `/:id` | Edita `label`, `description`, `unit`, `defaultValue`, `displayOrder`, `isActive`. **`key` y `valueType` no se editan** |
| DELETE | `/:id` | Elimina. 409 si la aplica el sistema o si algún plan la usa (desactívala en su lugar) |

**Campos:** `key`, `label`, `description`, `valueType` (`number` \| `boolean` \| `text`), `unit` (solo `number`), `defaultValue`, `displayOrder`, `isActive`, `isEnforced` (solo lectura).

**`isEnforced`:** `true` para las claves del registro `SUPPORTED_PLAN_LIMITS` (`src/core/tenant/services/shared/plan-limits.service.ts`). Deben ser de tipo `number`. Crear una característica con otra clave **no** hace que el sistema la aplique: cada límite real necesita su validación en la API.

**Límites aplicados** (solo en el admin del restaurante; el Super Admin no queda limitado):

| Clave | Cuenta | Bloquea |
|---|---|---|
| `maxProducts` | productos | Crear o importar productos |
| `maxBranches` | sucursales activas | Crear sucursales |
| `maxUsers` | usuarios no eliminados | Crear o reactivar usuarios |
| `maxCashRegisters` | cajas activas | Crear cajas a mano (la "Caja Principal" automática no se limita) |
| `maxBrands` | marcas activas | Crear marcas |

**Resolución del límite:** valor en `plans.features[clave]` → si el plan no la incluye, `defaultValue` del catálogo (si está activa) → si tampoco hay, **sin límite**. Ya no hay valores fijos en el código (antes `maxProducts` caía a 150). `GET /products/import/capacity` devuelve `maxProducts` y `remaining` en `null` y `unlimited: true` cuando no hay límite.

**Planes:** `POST/PATCH /plans` valida que los valores de las claves registradas tengan el tipo correcto (número ≥ 0, Sí/No o texto). Las claves no registradas (planes antiguos) se aceptan sin validar.

Migración: `drizzle/master/0018_create_plan_feature_definitions.sql` (crea la tabla y siembra `maxProducts`).

# 🏢 Tenants — Directorio de Negocios

Gestión del directorio central de tenants (restaurantes/negocios). Cada tenant tiene su propia base de datos en un servidor asignado.

**Base path:** `/api/master/tenants`  
**Autenticación:** 🔒 Todos los endpoints requieren token de super-admin.

---

## Endpoints

### `GET /` — Listar tenants (paginado)

**Query params**

| Param | Tipo | Descripción |
|---|---|---|
| `page` | `number` | Página (default: `1`) |
| `limit` | `number` | Elementos por página (default: `10`) |
| `name` | `string` | Filtrar por nombre (búsqueda parcial, case-insensitive) |
| `status` | `string` | `active` \| `inactive` |
| `planId` | `number` | Filtrar por plan |
| `serverId` | `number` | Filtrar por servidor de BD |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Tenants obtenidos con éxito",
  "data": {
    "list": [
      {
        "id": 1,
        "slug": "los-andes",
        "name": "Restaurante Los Andes",
        "status": "active",
        "serverId": 1,
        "dbName": "tenant_los_andes",
        "planId": 2,
        "planStartsAt": "2026-01-01T00:00:00.000Z",
        "planEndsAt": "2027-01-01T00:00:00.000Z",
        "billingCycle": "yearly",
        "ownerName": "Carlos López",
        "ownerPhone": "+51 999 888 777",
        "internalNotes": null,
        "plan": { "id": 2, "name": "Pro", "monthlyPrice": "59.00" },
        "server": { "id": 1, "name": "Hetzner-Node-01" },
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "meta": {
      "total": 42,
      "page": 1,
      "limit": 10,
      "totalPages": 5
    }
  }
}
```

---

### `POST /` — Crear tenant

> Al crear un tenant se realiza una **transacción** que:
> 1. Valida disponibilidad del servidor
> 2. Inserta el tenant
> 3. Crea la suscripción inicial
> 4. Incrementa `currentTenants` en el servidor

**Body**
```json
{
  "name": "Restaurante El Fogón",
  "slug": "el-fogon",
  "dbName": "tenant_el_fogon",
  "serverId": 1,
  "planId": 1,
  "billingCycle": "monthly",
  "status": "active",
  "ownerName": "Ana Pérez",
  "ownerPhone": "+51 988 777 666",
  "internalNotes": "Cliente referido por socio",
  "planEndsAt": null
}
```

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `name` | `string` | ✅ | Max 255 |
| `slug` | `string` | ✅ | Solo minúsculas, números y `-`. No puede ser reservado |
| `dbName` | `string` | ✅ | Solo minúsculas, números y `_`. Único en la BD |
| `serverId` | `number` | ✅ | ID de servidor activo con capacidad disponible |
| `planId` | `number` | ✅ | ID de plan existente |
| `billingCycle` | `string` | ✅ | `monthly` \| `yearly` |
| `status` | `string` | ❌ | `active` \| `inactive`. Default `active` |
| `ownerName` | `string` | ❌ | Nombre del dueño |
| `ownerPhone` | `string` | ❌ | Teléfono del dueño |
| `internalNotes` | `string` | ❌ | Notas internas del admin |
| `planEndsAt` | `string` (ISO 8601) | ❌ | Si se define, el precio se toma como `0.00` (prueba gratuita) |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "message": "Tenant creado con éxito",
  "data": {
    "id": 5,
    "name": "Restaurante El Fogón",
    "slug": "el-fogon",
    "dbName": "tenant_el_fogon",
    "serverId": 1,
    "planId": 1,
    "billingCycle": "monthly",
    "status": "active",
    "ownerName": "Ana Pérez",
    "ownerPhone": "+51 988 777 666",
    "internalNotes": "Cliente referido por socio",
    "planStartsAt": "2026-01-01T00:00:00.000Z",
    "planEndsAt": "2026-02-01T00:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Errores frecuentes**
| Código | Mensaje |
|---|---|
| `400` | El slug ya está en uso por otro tenant |
| `400` | El nombre de base de datos ya está en uso |
| `400` | El servidor seleccionado no está activo |
| `400` | El servidor seleccionado ha alcanzado su límite de tenants |
| `400` | El plan seleccionado no existe |

---

### `GET /slug/:slug` — Obtener tenant por slug

Útil para la resolución de tenants desde el frontend o subdominios.

**Ejemplo:** `GET /api/master/tenants/slug/el-fogon`

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Tenant obtenido con éxito",
  "data": {
    "id": 5,
    "slug": "el-fogon",
    "name": "Restaurante El Fogón",
    "plan": { "id": 1, "name": "Basic" },
    "server": { "id": 1, "name": "Hetzner-Node-01" },
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `GET /:id` — Obtener tenant por ID

Incluye relaciones: `plan`, `server`, `subscriptions`.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Tenant obtenido con éxito",
  "data": {
    "id": 1,
    "slug": "los-andes",
    "plan": { "id": 2, "name": "Pro" },
    "server": { "id": 1, "name": "Hetzner-Node-01" },
    "subscriptions": [
      { "id": 1, "status": "active", "pricePaid": "590.00" }
    ],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `PATCH /:id` — Actualizar tenant

**Body** (todos los campos opcionales)
```json
{
  "name": "Restaurante Los Andes - Nueva Sede",
  "status": "inactive",
  "ownerName": "María García",
  "internalNotes": "Suspendido por falta de pago"
}
```

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Tenant actualizado con éxito",
  "data": {
    "id": 1,
    "slug": "los-andes",
    "name": "Restaurante Los Andes - Nueva Sede",
    "status": "inactive",
    "ownerName": "María García",
    "internalNotes": "Suspendido por falta de pago",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `POST /:id/renew` — Renovar suscripción

Renueva el plan del tenant y registra una nueva entrada en el historial de suscripciones.

> La nueva suscripción comienza donde terminó la anterior (`planEndsAt` actual).

**Body**
```json
{
  "planId": 2,
  "billingCycle": "yearly",
  "startDate": "2027-01-01T00:00:00.000Z",
  "endDate": "2028-01-01T00:00:00.000Z",
  "pricePaid": "590.00",
  "notes": "Pago procesado vía PayPal",
  "gatewayName": "paypal",
  "gatewayInvoiceId": "INV-2027-001"
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `planId` | `number` | ❌ | Si no se envía, mantiene el plan actual |
| `billingCycle` | `string` | ❌ | Si no se envía, mantiene el ciclo actual |
| `startDate` | `string` (ISO 8601) | ❌ | Default: fecha de vencimiento actual |
| `endDate` | `string` (ISO 8601) | ❌ | Si no se envía, se calcula según ciclo |
| `pricePaid` | `string` | ❌ | Si no se envía, se toma del precio del plan |
| `notes` | `string` | ❌ | Notas del pago |
| `gatewayName` | `string` | ❌ | Ej: `"paypal"`, `"stripe"` |
| `gatewayInvoiceId` | `string` | ❌ | ID de factura del gateway |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Suscripción renovada con éxito",
  "data": {
    "id": 1,
    "planId": 2,
    "billingCycle": "yearly",
    "planStartsAt": "2027-01-01T00:00:00.000Z",
    "planEndsAt": "2028-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `DELETE /:id` — Eliminar tenant

> ⚠️ Esta acción es irreversible. Borra el registro en master (suscripciones, grants, auditoría y tickets en cascada), decrementa el contador del servidor y **elimina la base de datos física** del tenant.

- Antes de borrar la BD se cierra el pool de conexiones del tenant en la API y se invalida la caché `tenant:<slug>` de Redis.
- Nunca se borran `postgres`, `template0`, `template1` ni la BD master, aunque estén registradas en un tenant.
- Si la BD no se puede borrar, el tenant queda eliminado y el `message` lo indica para revisarla en el servidor.
- Las imágenes del tenant en R2 (claves `<slug>/...` referenciadas en su BD) se borran después de eliminar la BD.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Tenant, base de datos e imágenes eliminados correctamente",
  "data": null
}
```

---

### `POST /:id/clone` — Duplicar tenant

Crea un tenant nuevo (BD nueva + registro en master) copiando la configuración y el catálogo del tenant `:id`. El origen solo se lee.

- **Body:** el mismo que `POST /` (`name`, `slug`, `dbName`, `serverId`, `planId`, `billingCycle`, `planEndsAt?`, `ownerName?`, `ownerPhone?`, `internalNotes?`).
- **Se copia:** todas las tablas del tenant (sucursales, marcas, cajas y series con sus correlativos, impresoras, estaciones, salones y mesas, canales, métodos de pago, motivos, impuestos, RBAC, usuarios con sus contraseñas, productos, categorías, extras, almacén…). Las tablas nuevas que se añadan en el futuro se copian solas.
- **No se copia:** pedidos, comprobantes, sesiones y movimientos de caja, kardex y descargas, compras, traslados, ajustes, requerimientos, porcionamientos, clientes, tipo de cambio, `audit_log` y `refresh_tokens`.
- **Ajustes en la copia:** sin facturación electrónica (`facturador_empresa_id`, RUC y razón social en `tenant_configs` y `branches` a `NULL`, series con `is_active_facturacion = false`), mesas en `available` y, si hay una sola marca, se renombra con el `name` nuevo.
- **Imágenes:** las claves `slug-origen/...` de R2 se copian a `slug-nuevo/...`. Si una falla, la copia queda sin esa imagen (nunca apunta al archivo del original).
- **Permisos:** se copian los grants del origen (`tenant_feature_grants`, `tenant_role_grants`) y se ejecuta el sync RBAC.
- **Validaciones:** slug y BD libres (incluida una BD física con ese nombre en el servidor), plan y servidor válidos, y el origen debe tener todas las migraciones de tenant aplicadas.
- Si algo falla, se borra la BD nueva, las imágenes copiadas y el registro en master.

**Response 201:**
```json
{
  "success": true,
  "message": "Tenant duplicado con éxito",
  "data": {
    "tenant": { "id": 40, "slug": "nuevo-slug", "isDefaultTemplate": false, "...": "..." },
    "stats": { "tablesCopied": 42, "rowsCopied": 242, "imagesCopied": 2, "imagesFailed": 0 }
  }
}
```

### `PATCH /:id/default-template` — Marcar plantilla por defecto

Marca o desmarca el tenant como plantilla por defecto para duplicar. Solo puede haber una: al marcar una, se desmarca la anterior.

**Body:** `{ "isDefault": true }`

---

## Slugs reservados

Los siguientes slugs **no pueden usarse** al crear o actualizar un tenant:

```
api, admin, app, auth, login, register, dashboard, settings, account,
billing, subscriptions, www, localhost, test, dev, staging, demo,
status, docs, help, support, mail, static, assets, cdn, media, images,
webhook, oauth, callback, error, root, sys, system, config, null, secure,
about, contact, legal, privacy, terms, blog, store, shop ...
```

---

## Schema de BD

```ts
// db/master/schema.ts
export const tenants = pgTable('tenants', {
  id:            serial('id').primaryKey(),
  slug:          varchar('slug', { length: 255 }).notNull().unique(),
  name:          varchar('name', { length: 255 }).notNull(),
  status:        text('status', { enum: ['active', 'inactive'] }).default('active').notNull(),
  serverId:      integer('server_id').references(() => dbServers.id).notNull(),
  dbName:        varchar('db_name', { length: 255 }).notNull().unique(),
  planId:        integer('plan_id').references(() => plans.id).notNull(),
  planStartsAt:  timestamp('plan_starts_at', { withTimezone: true }).defaultNow(),
  planEndsAt:    timestamp('plan_ends_at',   { withTimezone: true }),
  billingCycle:  text('billing_cycle', { enum: ['monthly', 'yearly'] }),
  ownerName:     varchar('owner_name',  { length: 255 }),
  ownerPhone:    varchar('owner_phone', { length: 255 }),
  internalNotes: text('internal_notes'),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

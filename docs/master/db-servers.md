# 🖥️ DB Servers — Servidores de Base de Datos

Gestión de los nodos de infraestructura donde se alojan las bases de datos de los tenants.
Cada servidor representa un VPS/nodo PostgreSQL con capacidad limitada de tenants.

**Base path:** `/api/master/db-servers`  
**Autenticación:** 🔒 Todos los endpoints requieren token de super-admin.

---

## Endpoints

### `GET /` — Listar servidores

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Hetzner-Node-01",
      "dbHost": "10.0.0.1",
      "dbPort": 5432,
      "dbUser": "pg_master",
      "dbPassword": "****",
      "isActive": true,
      "maxTenants": 100,
      "currentTenants": 43,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

> ⚠️ El campo `dbPassword` se almacena en BD. Se recomienda encriptar el valor antes de guardarlo.

---

### `POST /` — Registrar servidor

**Body**
```json
{
  "name": "Hetzner-Node-02",
  "dbHost": "10.0.0.2",
  "dbPort": 5432,
  "dbUser": "pg_master",
  "dbPassword": "supersecreto",
  "isActive": true,
  "maxTenants": 80
}
```

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `name` | `string` | ✅ | Único, max 255 |
| `dbHost` | `string` | ✅ | IP o hostname del servidor |
| `dbPort` | `number` | ❌ | Default `5432`, rango 1–65535 |
| `dbUser` | `string` | ✅ | Usuario administrador PostgreSQL |
| `dbPassword` | `string` | ✅ | Contraseña maestra del servidor |
| `isActive` | `boolean` | ❌ | Default `true` |
| `maxTenants` | `number` | ❌ | Default `100` |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "message": "Servidor registrado con éxito",
  "data": { ... }
}
```

---

### `GET /:id` — Obtener servidor por ID

Incluye los tenants asignados a este servidor en la respuesta.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Hetzner-Node-01",
    "dbHost": "10.0.0.1",
    "dbPort": 5432,
    "isActive": true,
    "maxTenants": 100,
    "currentTenants": 43,
    "tenants": [
      { "id": 1, "name": "Restaurante Los Andes", "slug": "los-andes", "status": "active" },
      ...
    ],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### `PATCH /:id` — Actualizar servidor

**Body** (todos los campos son opcionales)
```json
{
  "isActive": false,
  "maxTenants": 120,
  "dbPassword": "nuevaContraseña"
}
```

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Servidor actualizado con éxito",
  "data": { ... }
}
```

---

### `DELETE /:id` — Eliminar servidor

> ❌ **No se puede eliminar un servidor que tenga tenants asignados.**  
> Reasigna o elimina los tenants primero.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Servidor eliminado correctamente"
}
```

**Error si tiene tenants** `400`
```json
{
  "success": false,
  "message": "No se puede eliminar: el servidor tiene 5 tenant(s) asignado(s)"
}
```

---

## Contadores de capacidad

| Campo | Descripción |
|---|---|
| `maxTenants` | Límite máximo configurable por el admin |
| `currentTenants` | Actualizado automáticamente al crear/eliminar tenants |

Al crear un tenant → `currentTenants + 1`  
Al eliminar un tenant → `currentTenants - 1` (mínimo `0`)

---

## Schema de BD

```ts
// db/master/schema.ts
export const dbServers = pgTable('db_servers', {
  id:             serial('id').primaryKey(),
  name:           varchar('name', { length: 255 }).notNull().unique(),
  dbHost:         varchar('db_host', { length: 255 }).notNull(),
  dbPort:         integer('db_port').default(5432).notNull(),
  dbUser:         varchar('db_user', { length: 255 }).notNull(),
  dbPassword:     text('db_password').notNull(),
  isActive:       boolean('is_active').default(true).notNull(),
  maxTenants:     integer('max_tenants').default(100).notNull(),
  currentTenants: integer('current_tenants').default(0).notNull(),
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

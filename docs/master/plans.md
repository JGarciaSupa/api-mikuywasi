# 💳 Plans — Planes de suscripción

Gestión de los planes que se ofrecen a los tenants del SaaS.

**Base path:** `/api/master/plans`  
**Autenticación:** 🔒 Todos los endpoints requieren token de super-admin.

---

## Endpoints

### `GET /` — Listar planes
> Query params:
> - `all=true` → incluye planes ocultos (`visible: false`)
> - Sin `all` → solo planes visibles (modo público/listing)

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Planes obtenidos con éxito",
  "data": [
    {
      "id": 1,
      "name": "Starter",
      "monthlyPrice": "29.00",
      "yearlyPrice": "290.00",
      "features": {
        "products": 100,
        "users": 50,
        "delivery": true,
        "support": "24/7"
      },
      "visible": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### `POST /` — Crear plan

**Body**
```json
{
  "name": "Pro",
  "monthlyPrice": "59.00",
  "yearlyPrice": "590.00",
  "features": {
    "products": 250,
    "users": 100,
    "delivery": true,
    "support": "24/7"
  },
  "visible": true
}
```

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `name` | `string` | ✅ | Max 255 |
| `monthlyPrice` | `string` | ✅ | Formato decimal: `"59.00"` |
| `yearlyPrice` | `string` | ✅ | Formato decimal: `"590.00"` |
| `features` | `object` | ❌ | Objeto JSON libre (clave-valor). Puede contener textos, números o booleanos. Ej: `{"products": 100, "users": 50, "delivery": true, "support": "24/7"}`. Default: `{}` |
| `visible` | `boolean` | ❌ | Default `false` |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "message": "Plan creado con éxito",
  "data": {
    "id": 2,
    "name": "Pro",
    "monthlyPrice": "59.00",
    "yearlyPrice": "590.00",
    "features": {
      "products": 250,
      "users": 100,
      "delivery": true,
      "support": "24/7"
    },
    "visible": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `GET /:id` — Obtener plan por ID

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Plan obtenido con éxito",
  "data": {
    "id": 1,
    "name": "Starter",
    "monthlyPrice": "29.00",
    "yearlyPrice": "290.00",
    "features": {
      "products": 100,
      "users": 50,
      "delivery": true,
      "support": "24/7"
    },
    "visible": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `PATCH /:id` — Actualizar plan

**Body** (todos los campos son opcionales)
```json
{
  "name": "Starter Plus",
  "monthlyPrice": "39.00",
  "visible": true
}
```

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Plan actualizado con éxito",
  "data": {
    "id": 1,
    "name": "Starter Plus",
    "monthlyPrice": "39.00",
    "yearlyPrice": "290.00",
    "features": {
      "products": 100,
      "users": 50,
      "delivery": true,
      "support": "24/7"
    },
    "visible": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `DELETE /:id` — Eliminar plan

> ⚠️ Si el plan tiene tenants o suscripciones activas, la base de datos puede rechazar la eliminación por la restricción de llave foránea.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Plan eliminado correctamente",
  "data": null
}
```

---

## Schema de BD

```ts
// db/master/schema.ts
export const plans = pgTable('plans', {
  id:           serial('id').primaryKey(),
  name:         varchar('name', { length: 255 }).notNull(),
  monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }).notNull(),
  yearlyPrice:  decimal('yearly_price',  { precision: 10, scale: 2 }).notNull(),
  features:     jsonb('features').$type<Record<string, any>>(),
  visible:      boolean('visible').default(false).notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

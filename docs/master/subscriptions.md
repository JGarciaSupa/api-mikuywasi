# 🧾 Subscriptions — Historial de Facturación

Registro inmutable del historial de suscripciones de los tenants.
Las suscripciones se crean automáticamente al crear o renovar un tenant.

**Base path:** `/api/master/subscriptions`  
**Autenticación:** 🔒 Todos los endpoints requieren token de super-admin.

---

## Endpoints

### `GET /` — Listar suscripciones (paginado)

**Query params**

| Param | Tipo | Descripción |
|---|---|---|
| `page` | `number` | Página (default: `1`) |
| `limit` | `number` | Elementos por página (default: `10`) |
| `tenantId` | `number` | Filtrar por tenant |
| `status` | `string` | `active` \| `expired` \| `canceled` \| `pending_payment` |
| `planId` | `number` | Filtrar por plan |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "tenantId": 3,
      "planId": 2,
      "billingCycle": "yearly",
      "pricePaid": "590.00",
      "startDate": "2026-01-01T00:00:00.000Z",
      "endDate": "2027-01-01T00:00:00.000Z",
      "status": "active",
      "paymentStatus": "paid",
      "notes": null,
      "gatewayName": "stripe",
      "gatewayInvoiceId": "in_1ABC123",
      "tenant": { "id": 3, "name": "Restaurante El Fogón", "slug": "el-fogon" },
      "plan": { "id": 2, "name": "Pro", "monthlyPrice": "59.00", "yearlyPrice": "590.00" },
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 10,
    "totalPages": 12
  }
}
```

---

### `GET /tenant/:tenantId` — Historial de un tenant

Devuelve todas las suscripciones de un tenant específico, ordenadas por fecha descendente.

**Ejemplo:** `GET /api/master/subscriptions/tenant/3`

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "billingCycle": "yearly",
      "pricePaid": "590.00",
      "status": "active",
      "startDate": "2026-01-01T00:00:00.000Z",
      "endDate": "2027-01-01T00:00:00.000Z",
      "plan": { ... },
      ...
    },
    {
      "id": 2,
      "billingCycle": "monthly",
      "pricePaid": "59.00",
      "status": "expired",
      ...
    }
  ]
}
```

---

### `GET /:id` — Obtener suscripción por ID

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "tenantId": 3,
    "planId": 2,
    "billingCycle": "yearly",
    "pricePaid": "590.00",
    "startDate": "...",
    "endDate": "...",
    "status": "active",
    "paymentStatus": "paid",
    "tenant": { ... },
    "plan": { ... },
    ...
  }
}
```

---

### `PATCH /:id` — Actualizar suscripción

Solo permite actualizar campos administrativos (estado, pago, notas). No modifica fechas ni precios.

**Body** (todos opcionales)
```json
{
  "status": "pending_payment",
  "paymentStatus": "pending",
  "notes": "Esperando confirmación bancaria",
  "gatewayName": "stripe",
  "gatewayInvoiceId": "in_1ABC456"
}
```

| Campo | Tipo | Valores posibles |
|---|---|---|
| `status` | `string` | `active` \| `expired` \| `canceled` \| `pending_payment` |
| `paymentStatus` | `string` | `paid` \| `pending` \| `failed` |
| `notes` | `string` | Texto libre |
| `gatewayName` | `string` | Nombre del gateway de pago |
| `gatewayInvoiceId` | `string` | ID de factura externa |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Suscripción actualizada con éxito",
  "data": { ... }
}
```

---

### `POST /:id/cancel` — Cancelar suscripción

Cambia el `status` a `canceled`. No puede cancelarse si ya está cancelada.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Suscripción cancelada con éxito",
  "data": { ... }
}
```

**Error si ya está cancelada** `400`
```json
{
  "success": false,
  "message": "La suscripción ya está cancelada"
}
```

---

## Estados de una suscripción

```
active  ──────► expired      (al vencer la fecha de fin)
active  ──────► canceled     (cancelación manual)
active  ──────► pending_payment (fallo de pago)
pending_payment ──► active   (tras confirmar pago)
pending_payment ──► failed   (pago fallido definitivo)
```

---

## Creación automática

Las suscripciones **no se crean manualmente** vía `POST`. Se crean en dos momentos:

1. **Al crear un tenant** → `POST /api/master/tenants`
2. **Al renovar un tenant** → `POST /api/master/tenants/:id/renew`

---

## Función de expiración (uso interno / cron job)

El servicio expone `markExpiredSubscriptions()` que actualiza a `expired` todas las suscripciones activas cuya `endDate` ya pasó. Se puede usar desde un job programado:

```ts
import { markExpiredSubscriptions } from './core/master/services/subscriptions.service';

// Ejecutar diariamente
const result = await markExpiredSubscriptions();
console.log(`Suscripciones expiradas: ${result.updated}`);
```

---

## Schema de BD

```ts
// db/master/schema.ts
export const subscriptions = pgTable('subscriptions', {
  id:               serial('id').primaryKey(),
  tenantId:         integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  planId:           integer('plan_id').references(() => plans.id).notNull(),
  billingCycle:     text('billing_cycle', { enum: ['monthly', 'yearly'] }).notNull(),
  pricePaid:        decimal('price_paid', { precision: 10, scale: 2 }).notNull(),
  startDate:        timestamp('start_date', { withTimezone: true }).notNull(),
  endDate:          timestamp('end_date',   { withTimezone: true }).notNull(),
  status:           text('status', { enum: ['active', 'expired', 'canceled', 'pending_payment'] }).default('active').notNull(),
  paymentStatus:    text('payment_status', { enum: ['paid', 'pending', 'failed'] }).default('paid').notNull(),
  notes:            text('notes'),
  gatewayName:      varchar('gateway_name', { length: 50 }),
  gatewayInvoiceId: varchar('gateway_invoice_id', { length: 255 }),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

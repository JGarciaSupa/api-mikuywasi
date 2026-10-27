# Admin Orders API Documentation

Este módulo permite a los administradores gestionar los pedidos de su restaurante de forma segura y eficiente.

**Ruta Base:** `/api/admin/orders`
**Seguridad:** Requiere Bearer Token (JWT) y rol `admin`.

---

## 1. Listado Paginado de Órdenes
Obtiene las órdenes del tenant autenticado con soporte para filtros y paginación.

- **URL:** `GET /api/admin/orders`
- **Query Params:**
  - `page` (opcional): Número de página (default: 1).
  - `limit` (opcional): Items por página (default: 10).
  - `status` (opcional): Filtrar por estado (`pending`, `confirmed`, `preparing`, `dispatched`, `completed`, `cancelled`).
  - `paymentStatus` (opcional): Filtrar por pago (`unpaid`, `paid`, `review_pending`).
  - `search` (opcional): Búsqueda por nombre de cliente, teléfono o código de orden.
  - `startDate/endDate` (opcional): Filtro por rango de fechas (formato YYYY-MM-DD).

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "ORD-123456",
      "customerName": "Juan Pérez",
      "total": "45.00",
      "status": "pending",
      "createdAt": "2024-04-03T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 50,
    "totalPages": 5,
    "currentPage": 1,
    "limit": 10
  }
}
```

---

## 2. Detalle de Orden
Obtiene toda la información de un pedido específico, incluyendo sus productos.

- **URL:** `GET /api/admin/orders/:id`

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "ORD-123456",
    "customerName": "Juan Pérez",
    "items": [
      {
        "productName": "Cebiche Clásico",
        "quantity": 1,
        "totalPrice": "35.00",
        "notes": "Sin cebolla"
      }
    ],
    "deliveryInfo": {
      "address": "Calle Falsa 123",
      "lat": -12.043,
      "lng": -77.028
    }
  }
}
```

---

## 3. Actualizar Estado de Pedido
Cambia el estado logístico del pedido.

- **URL:** `PATCH /api/admin/orders/:id/status`
- **Body:**
```json
{
  "status": "preparing"
}
```

---

## 4. Actualizar Estado de Pago
Valida o cambia el estado del pago.

- **URL:** `PATCH /api/admin/orders/:id/payment-status`
- **Body:**
```json
{
  "paymentStatus": "paid"
}
```

---

## 5. Estadísticas Sugeridas (Dashboard)
Obtiene contadores rápidos para el resumen del día.

- **URL:** `GET /api/admin/orders/stats`

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "data": {
    "todaySales": 1250.50,
    "todayOrders": 12,
    "byStatus": {
      "pending": 3,
      "preparing": 2,
      "dispatched": 1
    }
  }
}
```

## Ticket de anulación para cocina

- **URL:** `GET /api/admin/orders/:id/void-ticket?branchId=X[&itemId=Y]`
- **Auth:** `authMiddleware` (mismo nivel que `dispatch-payload`).
- **Solo lectura.** Devuelve los datos para imprimir el ticket de ANULACIÓN en las áreas de cocina que ya recibieron la comanda.
  - Con `itemId`: última anulación de ese ítem (`orders_items_deleted`): cantidad anulada (parcial o total), motivo, quién anuló y quién autorizó.
  - Sin `itemId`: el pedido debe estar `cancelled`; incluye los ítems enviados a cocina que seguían vigentes.
  - Si lo anulado no había llegado a cocina (`sent_to_kitchen = false`), `areas` llega vacío.
- **Respuesta `200`:** `{ success, data: { scope: 'item'|'order', order: { id, trackingCode, tableName, salesChannelName, waiterName }, reason, deletedByName, authorizedByName, voidedAt, areas: [{ stationName, printer, items: [{ id, productName, shortName, quantity, notes }] }] } }`
- **`400`:** pedido/ítem inexistente, pedido de otra sucursal, ítem sin anulaciones o pedido no cancelado.

## Pago mixto (varios métodos en un cobro)

- **URL:** `POST /api/admin/waiter/orders/:id/payments` · `GET /api/admin/waiter/orders/:id/payments`
- **Auth:** `authMiddleware` (mismo nivel que `PATCH /waiter/orders/:id/payment-status`).
- **Body:** `{ "payments": [{ "paymentMethodId": 1, "amount": 40 }, { "paymentMethodId": 2, "amount": 22.10 }] }` (2 a 10 líneas, sin métodos repetidos, máx. 2 decimales).
- **Reglas:** la suma debe ser igual a `subtotal + deliveryFee`; exige turno de caja abierto del cajero; métodos activos y de la sucursal.
- **Efecto:** guarda el desglose en `order_payments` (migración `0086`), marca el pedido `paid` + `completed`, `payment_method = 'Mixto'`, y registra **un ingreso de caja por método** (cada uno con su `is_cash` y su retención). La mesa pasa a `dirty`. El cobro con un solo método no cambia.
- **Comprobante:** `GET /billing/documents/:id/receipt` devuelve `paymentSummary.paymentMethod` desglosado (`"Efectivo S/ 40.00 + Yape S/ 22.10"`).

## REF / N° de voucher por pago (conciliación)

- Cada línea de pago acepta `reference` opcional (máx. 50; migración `0092`, columna `order_payments.reference`). Se guarda en los 4 caminos de cobro: `PATCH .../payment-status` (`payments[].reference`), `POST /waiter/orders/:id/payments` (validado por Zod), `PATCH /orders/:orderId/splits/:splitId/payment` y `PATCH /orders/:id/payment-method`.
- No afecta importes ni caja (`cash_movements.reference` sigue reservado a las marcas internas `reverso`/`devolucion`).
- El recibo la muestra en la forma de pago: `"Mastercard S/ 100.00 (REF 004512)"`, así sale en el ticket y en el PDF sin cambios en el front.

## Descuento del pedido

- **URL:** `POST /api/admin/waiter/orders/:id/discount` · `DELETE /api/admin/waiter/orders/:id/discount`
- **Permiso:** `pedidos.cambiar_estado_pago`.
- **Body (POST):** `{ "reasonId": 3, "manualAmount": 15 }` (`manualAmount` solo para motivos en modo `manual`).
- **Motivo:** del catálogo `reasons` con `type = 'discount'`, activo y de la sucursal del pedido. Modo `percentage` / `amount` usan el valor del motivo; se valida el tope `max_amount` (por pedido) y que el descuento sea menor al subtotal.
- **Efecto:** el importe se reparte entre las líneas vigentes en proporción a su importe (`order_items.discount_amount`), se recalculan `total_price` y el IGV de cada línea (`tax_snapshot`), y `orders.subtotal/total` quedan netos. Guarda `discount_amount`, motivo, modo, valor, quién y cuándo (migración `0087`). Reemplaza un descuento previo. El delivery no se descuenta.
- **Bloqueos:** pedido pagado, anulado/cerrado, transferido o con cuentas divididas (aplicar antes de dividir).
- **Edición posterior:** editar o anular un producto **retira el descuento** automáticamente (hay que volver a aplicarlo).
- **SUNAT:** las líneas viajan netas con su IGV, sin cambios en el facturador. El receipt incluye `meta.discountAmount` y `meta.discountMotivo` (informativo).

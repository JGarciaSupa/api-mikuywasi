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

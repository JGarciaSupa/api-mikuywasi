# Admin Kitchen API Documentation

Este módulo permite al personal de cocina gestionar la cola de pedidos activos, visualizar los items de cada orden y actualizar el estado de preparación en tiempo real.

**Ruta Base:** `/api/admin/kitchen`
**Seguridad:** Requiere Bearer Token (JWT) y rol `admin` o `kitchen`.

---

## 1. Listado de Órdenes para Cocina
Obtiene todas las órdenes activas (estados: `pending`, `confirmed`, `preparing`) del tenant autenticado. Las órdenes se devuelven con sus respectivos productos (items) y ordenadas por antigüedad (más antiguas primero).

- **URL:** `GET /api/admin/kitchen/orders`
- **Método:** `GET`

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "123",
      "customerName": "Juan Pérez",
      "tableName": "Mesa 05",
      "status": "confirmed",
      "deliveryType": "dine_in",
      "createdAt": "2024-05-11T10:00:00Z",
      "items": [
        {
          "id": "item-001",
          "productName": "Lomo Saltado",
          "quantity": 2,
          "notes": "Sin cebolla",
          "unitPrice": "35.00"
        }
      ]
    }
  ]
}
```

---

## 2. Actualizar Estado desde Cocina
Actualiza el estado de una orden específica dentro del flujo de trabajo de la cocina.

- **URL:** `PATCH /api/admin/kitchen/orders/:id/status`
- **Método:** `PATCH`
- **Body:**
```json
{
  "status": "preparing"
}
```

### Estados Permitidos:
- `preparing`: La cocina ha empezado a preparar el pedido.
- `ready_for_pickup`: El pedido está listo para ser recogido por el mesero o cliente.
- `completed`: El pedido ha sido entregado o finalizado en cocina.

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "message": "Estado de cocina actualizado",
  "data": {
    "id": "123",
    "status": "preparing",
    "updatedAt": "2024-05-11T10:15:00Z"
  }
}
```

### Errores Comunes:
- **400 Bad Request**: Si el estado no es uno de los permitidos para cocina o falta el ID.
- **403 Forbidden**: Si el usuario no tiene permisos de `kitchen` o `admin`.
- **404 Not Found**: Si la orden no existe en el tenant actual.

---

## 3. Avance de preparación por ítem (SIGG 2.7)

Estos endpoints comparten la misma forma de respuesta (`KitchenPreparationResult`):

```json
{
  "success": true,
  "message": "...",
  "data": {
    "order": { "id": "123", "status": "preparing" },
    "items": [
      { "id": 1, "quantity": 2, "preparedQty": 2, "preparedAt": "2024-05-11T10:12:00Z" }
    ],
    "confirmedStationIds": [4],
    "allConfirmed": false
  }
}
```

`allConfirmed`: true cuando TODAS las estaciones que toca el pedido (unión de `stationIds` de sus ítems) ya tienen todas sus líneas con `preparedQty >= quantity`. Cuando pasa a `true`, el pedido se mueve automáticamente a `ready_for_pickup` — no hace falta un paso adicional.

### 3.1. Marcar/deshacer una línea
- **URL:** `PATCH /api/admin/kitchen/orders/:id/items/:itemId/prepared`
- **Body:** `{ "qty": 1 }` — opcional; omitido = marca la línea completa (`preparedQty = quantity`). `qty: 0` deshace.
- Si esta línea era la última pendiente de su estación, la estación queda confirmada automáticamente (y el pedido pasa a `ready_for_pickup` si era la última estación pendiente).

### 3.2. Marcar todo el pedido listo
- **URL:** `POST /api/admin/kitchen/orders/:id/prepared`
- Sin body. Marca `preparedQty = quantity` en todas las líneas del pedido y confirma todas las estaciones requeridas.

### 3.3. Confirmar una estación
- **URL:** `POST /api/admin/kitchen/orders/:id/stations/:stationId/confirm`
- Marca listas las líneas asignadas a esa estación y confirma su parte. El pedido pasa a `ready_for_pickup` solo cuando todas las estaciones requeridas confirmaron.
- **400 Bad Request** si la estación no tiene ítems en este pedido.

### 3.4. Devolver un pedido a la cola
- **URL:** `POST /api/admin/kitchen/orders/:id/recall`
- Solo válido si el pedido está en `ready_for_pickup`. Limpia confirmaciones de estación y avance de todas las líneas, y regresa el pedido a `preparing`.
- **400 Bad Request** si el pedido no está en `ready_for_pickup`.

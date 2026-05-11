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

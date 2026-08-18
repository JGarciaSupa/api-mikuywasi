# Admin Kitchen API Documentation

Este módulo permite al personal de cocina gestionar la cola de pedidos activos, visualizar los items de cada orden y actualizar el estado de preparación en tiempo real.

**Ruta Base:** `/api/admin/kitchen`
**Seguridad:** Requiere Bearer Token (JWT) y rol `admin` o `kitchen`.

---

## Modelo de preparación

El avance de cocina se registra **por línea de pedido**, no por pedido completo. Cada
`order_item` lleva `prepared_qty` (unidades ya terminadas), y todo lo demás se deriva
de ahí:

| Concepto | Regla |
| --- | --- |
| Línea lista | `prepared_qty >= quantity` |
| Estación lista | todas las líneas que esa estación ve están listas (las suyas + las que no tienen estación asignada) |
| Pedido listo (`ready_for_pickup`) | todas las líneas del pedido están listas |

`order_station_confirmations` pasó a ser un **espejo** de ese cálculo: el backend
inserta y borra filas solo, nunca se escribe directamente. La consecuencia buscada es
que si el mozo agrega un plato a un pedido ya listo, la estación deja de estar completa
automáticamente y el pedido vuelve a la cola.

Todos los endpoints que mueven el avance devuelven la misma forma:

```json
{
  "order": { "id": "abc123", "status": "preparing", "...": "fila completa de orders" },
  "items": [{ "id": 41, "quantity": 3, "preparedQty": 1, "preparedAt": null }],
  "confirmedStationIds": [2],
  "allConfirmed": false
}
```

Ninguno acepta cambios sobre pedidos `cancelled` o `completed` (responden 500 con el
mensaje correspondiente).

---

## 1. Listado de Órdenes para Cocina
Obtiene las órdenes activas (estados `confirmed` y `preparing`) de la sucursal indicada,
ordenadas por antigüedad (más antiguas primero).

- **URL:** `GET /api/admin/kitchen/orders?branchId=1`
- **Método:** `GET`
- **Query:** `branchId` (requerido)

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
      "confirmedStationIds": [],
      "items": [
        {
          "id": 41,
          "productName": "Lomo Saltado",
          "quantity": 2,
          "notes": "Sin cebolla",
          "unitPrice": "35.00",
          "selectedAlternatives": [{ "name": "Término medio", "extraPrice": 0 }],
          "extras": [{ "extraId": 7, "extraName": "Queso extra", "qty": 1 }],
          "stationIds": [2],
          "preparedQty": 0,
          "preparedAt": null,
          "createdAt": "2024-05-11T10:00:00Z"
        }
      ]
    }
  ]
}
```

- `stationIds`: estaciones a las que se enruta el producto. **Array vacío = sin estación
  asignada**; el frontend debe mostrar ese ítem en TODAS las estaciones (fail-open),
  nunca ocultarlo.
- `extras` / `selectedAlternatives`: lo que el cliente eligió sobre el plato. Sin esto el
  cocinero prepara el producto base y se pierde el "+ queso extra".
- `createdAt` del ítem: permite distinguir las adiciones posteriores del mozo, que tienen
  su propio reloj respecto del `createdAt` del pedido.

---

## 2. Marcar / deshacer una línea
Registra cuánto de UNA línea terminó cocina. Es la operación base de la pantalla.

- **URL:** `PATCH /api/admin/kitchen/orders/:id/items/:itemId/prepared`
- **Body:** `{ "qty": 1 }` — opcional.
  - Sin body (o sin `qty`): marca la línea **completa**.
  - `qty` entre 1 y `quantity`: avance parcial (2 de 3 hamburguesas).
  - `qty: 0`: **deshace** la marca de esa línea.

`qty` se recorta al rango `[0, quantity]`, así que mandar de más no rompe nada.

Si el pedido estaba en `confirmed` pasa solo a `preparing` al marcar la primera línea; y
si estaba en `ready_for_pickup` y se deshace una línea, vuelve a `preparing`.

---

## 3. Marcar todo el pedido
Marca listas todas las líneas. Es el atajo para pedidos de una sola estación.

- **URL:** `POST /api/admin/kitchen/orders/:id/prepared`

---

## 4. Confirmar la parte de una estación
Marca listas todas las líneas que esa estación ve (las suyas + las sin asignar). El
pedido pasa a `ready_for_pickup` solo si con eso quedan listas TODAS las líneas.

- **URL:** `POST /api/admin/kitchen/orders/:id/stations/:stationId/confirm`

---

## 5. Devolver a la cola (recall)
Deshace el pedido completo: pone todas las líneas en 0, borra las confirmaciones de
estación y devuelve el pedido a `preparing`. Pensado para el toque accidental en la
tablet.

- **URL:** `POST /api/admin/kitchen/orders/:id/recall`
- Solo permitido desde `confirmed`, `preparing` o `ready_for_pickup`.

---

## 6. Actualizar Estado desde Cocina
Actualiza el estado de una orden dentro del flujo de trabajo de la cocina.

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
- `ready_for_pickup`: Equivale a *marcar todo el pedido* (punto 3) — se redirige ahí para
  que no queden líneas pendientes debajo de un pedido dado por terminado.
- `completed`: El pedido ha sido entregado o finalizado en cocina.

### Errores Comunes:
- **400 Bad Request**: Si el estado no es uno de los permitidos para cocina o falta el ID.
- **403 Forbidden**: Si el usuario no tiene permisos de `kitchen` o `admin`.
- **500**: Pedido inexistente, o `cancelled`/`completed` (ya no admite cambios desde cocina).

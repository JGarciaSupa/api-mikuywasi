# API de Métodos de Pago (Admin)

Gestión de los métodos de pago disponibles para cada restaurante.

## 1. Obtener todos los métodos de pago
Obtiene todos los métodos de pago configurados para un tenant específico.

- **URL:** `/api/admin/payment-methods`
- **Method:** `GET`
- **Auth required:** Sí (Admin)
- **Query Params:**
  - `tenantId` (Required): ID del tenant.

### Ejemplo de Respuesta (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Efectivo",
      "isActive": true,
      "tenantId": 1,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

## 2. Obtener método de pago por ID
Obtiene los detalles de un método de pago específico.

- **URL:** `/api/admin/payment-methods/:id`
- **Method:** `GET`
- **Auth required:** Sí (Admin)

---

## 3. Crear método de pago
Crea un nuevo método de pago para un tenant.

- **URL:** `/api/admin/payment-methods`
- **Method:** `POST`
- **Auth required:** Sí (Admin)
- **Body (JSON):**
  ```json
  {
    "name": "Yape",
    "isActive": true,
    "tenantId": 1
  }
  ```

---

## 4. Actualizar método de pago
Actualiza un método de pago existente.

- **URL:** `/api/admin/payment-methods/:id`
- **Method:** `PATCH`
- **Auth required:** Sí (Admin)
- **Body (JSON):**
  ```json
  {
    "name": "Plin",
    "isActive": false
  }
  ```

---

## 5. Eliminar método de pago
Elimina permanentemente un método de pago.

- **URL:** `/api/admin/payment-methods/:id`
- **Method:** `DELETE`
- **Auth required:** Sí (Admin)

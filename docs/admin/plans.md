# Documentación de la API de Planes (Admin)

Esta sección describe los endpoints disponibles para la gestión de planes desde el panel de administración.

**Base URL:** `/api/admin/plans`

## Endpoints

### 1. Obtener todos los planes
Retorna la lista de todos los planes configurados en el sistema, incluyendo aquellos que han sido eliminados de forma lógica (`deleted_at` no es null).

- **URL:** `/`
- **Método:** `GET`
- **Autenticación requerida:** Sí (Admin/Super-Admin)
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "name": "Plan Básico",
        "monthlyPrice": "10.00",
        "yearlyPrice": "100.00",
        "features": ["Feature 1", "Feature 2"],
        "order": 0,
        "visible": true,
        "createdAt": "2024-03-29T...",
        "updatedAt": "2024-03-29T...",
        "deletedAt": null
      }
    ]
  }
  ```

### 2. Crear un plan
Permite registrar un nuevo plan en el sistema.

- **URL:** `/`
- **Método:** `POST`
- **Body:**
  ```json
  {
    "name": "Plan Premium",
    "monthlyPrice": "25.00",
    "yearlyPrice": "250.00",
    "features": ["Ilimitadas Mesas", "Soporte 24/7"],
    "order": 1,
    "visible": true
  }
  ```
- **Respuesta Exitosa (201 Created):** `success: true` + datos del plan creado.

### 3. Editar un plan
Actualiza parcialmente los datos de un plan existente.

- **URL:** `/:id`
- **Método:** `PATCH`
- **Body:** (Campos opcionales)
  ```json
  {
    "name": "Plan Premium Pro",
    "monthlyPrice": "29.90"
  }
  ```
- **Respuesta Exitosa (200 OK):** `success: true` + datos actualizados.

### 4. Eliminar un plan (Lógico)
Marca un plan como eliminado sin borrarlo físicamente de la base de datos (setea `deleted_at`).

- **URL:** `/:id`
- **Método:** `DELETE`
- **Respuesta Exitosa (200 OK):** `success: true`

### 5. Actualizar visibilidad
Permite mostrar u ocultar un plan en la web de cara a los clientes.

- **URL:** `/:id/visibility`
- **Método:** `PATCH`
- **Body:**
  ```json
  {
    "visible": false
  }
  ```
- **Respuesta Exitosa (200 OK):** `success: true`

### 6. Ordenar planes
Permite actualizar el orden de visualización de múltiples planes en una sola petición.

- **URL:** `/reorder`
- **Método:** `PATCH`
- **Body:**
  ```json
  {
    "plans": [
      { "id": 1, "order": 1 },
      { "id": 2, "order": 0 }
    ]
  }
  ```
- **Respuesta Exitosa (200 OK):** `success: true`

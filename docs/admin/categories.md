# Categorías API (Admin)

Endpoints para la gestión de categorías de productos en el panel administrativo.

## Base URL
`/api/admin/categories`

## Endpoints

### 1. Obtener todas las categorías
Obtiene la lista de categorías para un tenant específico.

- **URL**: `/`
- **Method**: `GET`
- **Query Params**:
  - `tenantId` (Required): ID del tenant.
- **Success Response**:
  - **Code**: 200
  - **Content**:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": 1,
          "name": "Bebidas",
          "order": 0,
          "isActive": true,
          "startTime": "08:00:00",
          "endTime": "22:00:00",
          "availableDays": [0, 1, 2, 3, 4, 5, 6],
          "createdAt": "...",
          "updatedAt": "..."
        }
      ]
    }
    ```

### 2. Obtener una categoría por ID
- **URL**: `/:id`
- **Method**: `GET`
- **Success Response**:
  - **Code**: 200
  - **Content**: `{ "success": true, "data": { ... } }`

### 3. Crear una categoría
- **URL**: `/`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "tenantId": 1,
    "name": "Entradas",
    "order": 1,
    "isActive": true,
    "startTime": "08:00",
    "endTime": "23:00",
    "availableDays": [1, 2, 3, 4, 5]
  }
  ```
- **Success Response**:
  - **Code**: 201

### 4. Actualizar una categoría
- **URL**: `/:id`
- **Method**: `PATCH`
- **Body**: Parcial del objeto categoría.
- **Success Response**:
  - **Code**: 200

### 5. Eliminar una categoría
- **URL**: `/:id`
- **Method**: `DELETE`
- **Success Response**:
  - **Code**: 200

### 6. Reordenar categorías
Actualiza el orden de múltiples categorías en una sola operación.

- **URL**: `/reorder`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "categories": [
      { "id": 1, "order": 2 },
      { "id": 2, "order": 1 }
    ]
  }
  ```
- **Success Response**:
  - **Code**: 200

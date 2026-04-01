# Banners API (Admin)

Endpoints para la gestión de banners publicitarios en el panel administrativo.

## Base URL
`/api/admin/banners`

## Endpoints

### 1. Obtener todos los banners
Obtiene la lista de banners para un tenant específico, ordenados por el campo `order`.

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
          "tenantId": 1,
          "url": "https://r2.dominio.com/banners/uuid.jpg",
          "order": 1,
          "createdAt": "..."
        }
      ]
    }
    ```

### 2. Obtener un banner por ID
- **URL**: `/:id`
- **Method**: `GET`
- **Success Response**:
  - **Code**: 200
  - **Content**: `{ "success": true, "data": { ... } }`

### 3. Crear un banner
Crea un nuevo banner subiendo una imagen. Máximo 3 banners por tenant.

- **URL**: `/`
- **Method**: `POST`
- **Body (Multipart Form Data)**:
  - `tenantId` (Required): ID del tenant.
  - `order` (Optional): Orden del banner (por defecto 0).
  - `image` (Required): Archivo de imagen.
- **Success Response**:
  - **Code**: 201
  - **Content**: `{ "success": true, "message": "Banner creado con éxito", "data": { ... } }`
- **Error Response (Límite excedido)**:
  - **Code**: 400
  - **Content**: `{ "success": false, "message": "Solo se permite un máximo de 3 banners por tenant" }`

### 4. Actualizar un banner
Actualiza un banner. Si se envía una nueva imagen, se eliminará la anterior de R2.

- **URL**: `/:id`
- **Method**: `PATCH`
- **Body (Multipart Form Data)**:
  - `order` (Optional): Nuevo orden.
  - `image` (Optional): Nuevo archivo de imagen.
- **Success Response**:
  - **Code**: 200

### 5. Eliminar un banner
Elimina el registro de la base de datos y el archivo de imagen de R2.

- **URL**: `/:id`
- **Method**: `DELETE`
- **Success Response**:
  - **Code**: 200

### 6. Reordenar banners
Actualiza el orden de múltiples banners en una sola operación.

- **URL**: `/reorder`
- **Method**: `POST`
- **Body (JSON)**:
  ```json
  {
    "banners": [
      { "id": 1, "order": 2 },
      { "id": 2, "order": 1 }
    ]
  }
  ```
- **Success Response**:
  - **Code**: 200

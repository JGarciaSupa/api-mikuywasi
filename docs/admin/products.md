# Productos API (Admin)

Endpoints para la gestión de productos en el panel de administración.

**Base URL:** `/api/admin/products`

## Endpoints

### 1. Listar Productos
Obtiene una lista paginada de productos con filtros opcionales.

**GET** `/`

**Query Parameters:**
- `page` (opcional): Número de página (default: 1)
- `limit` (opcional): Cantidad de registros por página (default: 10)
- `name` (opcional): Filtrar por nombre (búsqueda parcial)
- `categoryId` (opcional): Filtrar por ID de categoría
- `tenantId` (opcional): Filtrar por ID de tenant

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "tenantId": 1,
      "categoryId": 2,
      "name": "Hamburguesa Clásica",
      "description": "Deliciosa hamburguesa con queso",
      "price": "15.50",
      "discountPrice": "12.00",
      "packagingFee": "1.00",
      "image": "https://pub-e1b1e7c8fc3b48f1bc39d2270899e478.r2.dev/products/uuid.jpg",
      "order": 0,
      "alternatives": [
        { "name": "Extra Queso", "extraPrice": 2.00 }
      ],
      "isActive": true,
      "createdAt": "2024-03-30T21:00:00Z",
      "updatedAt": "2024-03-30T21:00:00Z"
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

### 2. Obtener Producto por ID
Obtiene los detalles de un producto específico.

**GET** `/:id`

**Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

### 3. Crear Producto
Crea un nuevo producto. Soporta carga de imágenes mediante `multipart/form-data`.

**POST** `/`

**Content-Type:** `multipart/form-data`

**Body:**
- `tenantId` (Required, Number)
- `categoryId` (Optional, Number)
- `name` (Required, String)
- `description` (Optional, String)
- `price` (Required, Decimal string)
- `discountPrice` (Optional, Decimal string)
- `packagingFee` (Optional, Decimal string, default: "0.00")
- `order` (Optional, Number, default: 0)
- `isActive` (Optional, Boolean string "true"/"false", default: "true")
- `alternatives` (Optional, JSON string): `[{"name": "Extra", "extraPrice": 1.5}]`
- `image` (Optional, File): Imagen del producto

**Response:**
```json
{
  "success": true,
  "message": "Producto creado con éxito",
  "data": { ... }
}
```

### 4. Actualizar Producto
Actualiza un producto existente. Soporta actualización de imagen.

**PATCH** `/:id`

**Content-Type:** `multipart/form-data` (Todos los campos son opcionales)

**Response:**
```json
{
  "success": true,
  "message": "Producto actualizado con éxito",
  "data": { ... }
}
```

### 5. Eliminar Producto
Elimina un producto y su imagen asociada en R2.

**DELETE** `/:id`

**Response:**
```json
{
  "success": true,
  "message": "Producto eliminado con éxito"
}
```

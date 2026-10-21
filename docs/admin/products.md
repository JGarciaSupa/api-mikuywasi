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

### 6. Importar Productos (masivo)
Crea productos en lote para una sucursal. Cada fila se guarda en su propia transacción: una fila con error no deshace las demás.

**POST** `/import`

**Permiso:** `menu.gestionar_productos`

**Body (JSON):**
```json
{
  "branchId": 1,
  "createMissingCategories": true,
  "defaultCategoryId": null,
  "activate": true,
  "items": [
    {
      "row": 2,
      "name": "Lomo saltado",
      "shortName": "Lomo saltado",
      "description": "Con papas fritas y arroz",
      "price": "38.00",
      "discountPrice": "",
      "packagingFee": "1.00",
      "categoryName": "Fondos",
      "subcategoryName": "Carnes",
      "stock": "",
      "allowSellWithoutStock": "SI",
      "isActive": "SI",
      "order": 0
    }
  ]
}
```

- `items`: entre 1 y 1000 filas. `row` es el número de fila del archivo (para reportar errores).
- Requeridos por fila: `name` (máx. 150) y `price` (hasta 2 decimales, punto decimal).
- `shortName` máx. 35 · `categoryName` / `subcategoryName` máx. 50 · `stock` entero ≥ 0 (vacío = sin límite).
- Booleanos aceptan `SI`/`NO`, `true`/`false`, `1`/`0`. Si `isActive` viene vacío se usa `activate`.
- Categorías y subcategorías se buscan por nombre (sin distinguir mayúsculas) entre las de la sucursal o globales. Si no existen y `createMissingCategories` es `true`, se crean en la sucursal; si es `false`, la fila falla. Se respeta el máximo de 50 categorías principales.
- Los productos se asignan siempre a una **subcategoría** (igual que el alta manual): si una fila trae `categoryName` también debe traer `subcategoryName`, si no la fila falla.
- Sin categoría se usa `defaultCategoryId` (debe ser una subcategoría de la sucursal) o queda sin categoría.
- Cada producto creado recibe un precio por cada canal activo de la sucursal (o global) igual al precio importado, con los impuestos de la sucursal según su `defaultActive`, igual que al crearlo desde el admin.
- Se omiten (`skipped`) las filas cuyo nombre ya existe en la sucursal o se repite en el archivo.
- Se respeta el límite de productos del plan (`plans.features.maxProducts`; 150 si el plan no lo define). Las filas que lo superen fallan.

**Response:**
```json
{
  "success": true,
  "message": "Importación finalizada: 1 creados, 0 omitidos, 0 con error",
  "data": {
    "total": 1,
    "created": 1,
    "skipped": 0,
    "failed": 0,
    "maxProducts": 150,
    "createdCategories": ["Fondos", "Carnes"],
    "results": [
      { "row": 2, "name": "Lomo saltado", "status": "created", "productId": 120 }
    ]
  }
}
```

`status` de cada fila: `created` | `skipped` | `failed` (con `message`).

### Límite de productos por plan
Crear (`POST /`) e importar (`POST /import`) usan el mismo límite: la característica numérica `maxProducts` del plan del tenant (configurable desde el super admin en *Planes → Características del Plan*). Si el plan no la define, el límite es 150.

### 7. Capacidad de productos (para importar)
Devuelve el límite del plan, los productos existentes y cuántos se pueden crear todavía. Lo usa el asistente de importación para avisar antes de importar.

**GET** `/import/capacity`

**Permiso:** `menu.gestionar_productos`

**Response:**
```json
{
  "success": true,
  "data": { "maxProducts": 1000, "current": 120, "remaining": 880 }
}
```

### 8. Imagen de un producto importado
Asigna la imagen a un producto (paso final del asistente de importación). **Solo modifica la imagen**: a diferencia de `PATCH /:id`, no aplica valores por defecto ni toca precios, canales ni stock.

**POST** `/import/:id/image` · `multipart/form-data` con el campo `image`

**Permiso:** `menu.gestionar_productos`

- Formatos: JPG, PNG o WEBP · máximo 5 MB.
- Se procesa igual que el alta manual: `uploadToR2` redimensiona a 500 px y convierte a WebP en `<slug>/productos/`.
- Si el producto ya tenía imagen, la anterior se elimina de R2 después de guardar la nueva.

**Response:**
```json
{ "success": true, "message": "Imagen asignada con éxito", "data": { "productId": 12, "image": "https://.../productos/uuid.webp" } }
```
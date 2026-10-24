# Mesas (Restaurant Tables) - Admin API

Módulo para la gestión de mesas del restaurante. Cada mesa tiene un nombre y un identificador único (slug) de 8 caracteres que se genera automáticamente.

**Restricciones:**
- Máximo 50 mesas por tenant.
- El slug es único y no se puede cambiar.

## Endpoints

### 1. Obtener todas las mesas
Obtiene la lista completa de mesas asociadas a un tenant.

- **URL:** `/admin/tables`
- **Método:** `GET`
- **Query Params:**
  - `tenantId` (Required): ID del tenant.
- **Respuesta Exitosa (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Terraza 1",
      "slug": "xK9pL2mN",
      "tenantId": 1,
      "createdAt": "2024-03-20T10:00:00Z",
      "updatedAt": "2024-03-20T10:00:00Z"
    }
  ]
}
```

---

### 2. Crear mesa
Crea una nueva mesa. El slug de 8 caracteres se genera automáticamente y se garantiza su unicidad mediante reintentos.

- **URL:** `/admin/tables`
- **Método:** `POST`
- **Body (JSON):**
```json
{
  "name": "Mesa VIP 1",
  "tenantId": 1
}
```
- **Respuesta Exitosa (201 Created):**
```json
{
  "success": true,
  "message": "Mesa creada con éxito",
  "data": {
    "id": 2,
    "name": "Mesa VIP 1",
    "slug": "aB3cDeFg",
    "tenantId": 1
  }
}
```
- **Errores comunes:**
  - `400`: "Solo se permite un máximo de 50 mesas por tenant".

---

### 3. Actualizar mesa
Actualiza el nombre de una mesa existente.

- **URL:** `/admin/tables/:id`
- **Método:** `PATCH`
- **Body (JSON):**
```json
{
  "name": "Terraza Principal"
}
```
- **Respuesta Exitosa (200 OK):**
```json
{
  "success": true,
  "message": "Mesa actualizada con éxito",
  "data": { ... }
}
```

---

### 4. Eliminar Mesa
Elimina una mesa de forma permanente.

- **URL:** `/admin/tables/:id`
- **Método:** `DELETE`
- **Respuesta Exitosa (200 OK):**
```json
{
  "success": true,
  "message": "Mesa eliminada con éxito"
}
```

### 5. Importar salones y mesas (masivo)
Crea las mesas de una sucursal desde un archivo (el admin lee CSV/Excel y envía las filas). Reutiliza el alta manual: mismo tope de **50 mesas por sucursal**, salón de la misma sede y slug QR único. Cada fila es independiente.

**POST** `/tables/import`

**Permiso:** `menu.gestionar_mesas`

**Body (JSON):**
```json
{
  "branchId": 1,
  "items": [
    { "row": 2, "salon": "Terraza", "table": "T1", "pax": 4, "shape": "redonda" },
    { "row": 3, "salon": "Salón Principal", "table": "Mesa 1", "pax": 2 }
  ]
}
```

- `items`: entre 1 y 50 filas. `row` es el número de fila del archivo.
- `salon` (máx. 100) y `table` (máx. 50) requeridos. `pax` entero 1–99 (vacío = 1). `shape`: `cuadrada`/`square` o `redonda`/`round` (vacío = cuadrada).
- El salón se busca por nombre (sin distinguir mayúsculas) en la sucursal; si no existe se crea y aparece en `createdSalons`.
- Se omiten (`skipped`) las mesas cuyo nombre ya existe en la sucursal o se repite en el archivo.

**Response:**
```json
{
  "success": true,
  "message": "Importación finalizada: 2 creadas, 0 omitidas, 0 con error",
  "data": {
    "total": 2, "created": 2, "skipped": 0, "failed": 0,
    "createdSalons": ["Terraza"],
    "results": [
      { "row": 2, "salon": "Terraza", "table": "T1", "status": "created", "tableId": 12 },
      { "row": 3, "salon": "Salón Principal", "table": "Mesa 1", "status": "created", "tableId": 13 }
    ]
  }
}
```

### 6. Crear mesas en bloque

`POST /api/admin/tables/bulk` · Permiso `menu.gestionar_mesas`

Crea varias mesas de una vez en un salón, en una sola transacción. Dos modos:

- **Numeración:** `prefix` + número desde `start` hasta completar `count`. Si no se envía `start`, se usa el siguiente número libre de ese prefijo en la sucursal ("Mesa 1..12" existentes → empieza en 13). Prefijo "Mesa" → "Mesa 13"; prefijo "T-" → "T-13"; prefijo vacío → "13".
- **Replicar:** con `sourceTableId` se copian salón, pax y forma de esa mesa y se sigue su numeración ("Mesa 5" → "Mesa 6", "Mesa 7"…).

Los nombres que ya existen en la sucursal se omiten (`skipped`). Cada mesa recibe su propio slug de QR. Máximo 200 por petición. Con `dryRun: true` solo devuelve los nombres (vista previa).

**Body**
```json
{ "branchId": 1, "salonId": "uuid", "prefix": "Mesa", "start": 1, "count": 30, "capacity": 4, "shape": "square", "dryRun": false }
```
Replicar: `{ "branchId": 1, "sourceTableId": 12, "count": 5 }`

**Response 201**
```json
{ "success": true, "message": "30 mesas creadas con éxito", "data": { "names": ["Mesa 1", "..."], "skipped": [], "created": 30, "tables": [] } }
```
Errores 400: validación (cantidad 1–200, salón requerido), salón de otra sucursal, mesa a replicar inexistente o sin salón, nombre de más de 50 caracteres.

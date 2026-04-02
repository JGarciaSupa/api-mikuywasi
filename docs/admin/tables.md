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

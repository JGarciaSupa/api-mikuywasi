# Social Networks API (Admin)

API for managing social media links for a specific tenant.

**Base Path:** `/api/admin/social-networks`

## Endpoints

### 1. Get All Social Links
Returns all social links for a given tenant.

- **URL:** `/`
- **Method:** `GET`
- **Query Params:**
  - `tenantId` (Required): ID of the tenant.
- **Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "tenantId": 1,
      "platform": "whatsapp",
      "url": "https://wa.me/51987654321",
      "order": 0,
      "isActive": true,
      "createdAt": "2024-03-31T21:46:10Z"
    }
  ]
}
```

### 2. Get Social Link by ID
Returns a single social link.

- **URL:** `/:id`
- **Method:** `GET`
- **Response (200 OK):**
```json
{
  "success": true,
  "data": { ... }
}
```

### 3. Create Social Link
Adds a new social media profile.

- **URL:** `/`
- **Method:** `POST`
- **Body:**
```json
{
  "tenantId": 1,
  "platform": "whatsapp",
  "url": "https://wa.me/51987654321",
  "order": 1,
  "isActive": true
}
```
- **Valid Platforms:** `whatsapp`, `instagram`, `facebook`, `tiktok`, `x`, `youtube`.
- **Response (201 Created):**
```json
{
  "success": true,
  "message": "Red social creada con éxito",
  "data": { ... }
}
```

### 4. Update Social Link
Updates an existing social link.

- **URL:** `/:id`
- **Method:** `PATCH`
- **Body:** Partial updates allowed.
```json
{
  "url": "https://new-url.com",
  "isActive": false
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Red social actualizada con éxito",
  "data": { ... }
}
```

### 5. Delete Social Link
Removes a social link.

- **URL:** `/:id`
- **Method:** `DELETE`
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Red social eliminada con éxito"
}
```

### 6. Reorder Social Links
Updates the display order of multiple social links.

- **URL:** `/reorder`
- **Method:** `POST`
- **Body:**
```json
{
  "socialLinks": [
    { "id": 1, "order": 0 },
    { "id": 2, "order": 1 }
  ]
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Redes sociales reordenadas con éxito"
}
```

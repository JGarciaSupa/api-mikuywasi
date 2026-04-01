# API Staff (Usuarios del Tenant)

Endpoints para la gestión de usuarios (staff) de un tenant específico. Solo accesibles para usuarios con rol `admin`.

**Base Path:** `/admin/staff`

## 1. Obtener Usuarios (Paginado)
Obtiene la lista de usuarios pertenecientes al mismo tenant, excluyendo al usuario que realiza la consulta.

- **URL:** `GET /`
- **Auth Requerido:** Sí (Bearer Token + Rol Admin)
- **Query Params:**
  - `name`: (Opcional) Filtrar por nombre.
  - `page`: (Opcional, default: 1) Número de página.
  - `limit`: (Opcional, default: 10) Cantidad por página.

- **Respuesta Exitosa (200 OK):**
```json
{
  "success": true,
  "items": [
    {
      "id": 2,
      "name": "Staff User",
      "email": "staff@example.com",
      "role": "admin",
      "image": "https://pub-url.com/profile/uuid.jpg",
      "createdAt": "2024-03-31T20:00:00.000Z",
      "updatedAt": "2024-03-31T20:00:00.000Z"
    }
  ],
  "total": 1,
  "pages": 1,
  "currentPage": 1,
  "limit": 10
}
```

---

## 2. Crear Usuario
Crea un nuevo usuario para el tenant actual.

- **URL:** `POST /`
- **Auth Requerido:** Sí (Bearer Token + Rol Admin)
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `name`: (String) Nombre completo.
  - `email`: (String) Correo electrónico único.
  - `password`: (String) Mínimo 6 caracteres.
  - `role`: (Enum: 'admin') Rol del usuario.
  - `image`: (File, Opcional) Foto de perfil.

- **Respuesta Exitosa (201 Created):**
```json
{
  "success": true,
  "message": "Usuario creado con éxito",
  "data": {
    "id": 3,
    "name": "Nuevo Staff",
    "email": "nuevo@example.com",
    "role": "admin",
    "image": "https://pub-url.com/profile/uuid.jpg",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## 3. Editar Usuario
Actualiza los datos de un usuario. Permite cambiar el password (escribe-únicamente) y la foto.

- **URL:** `PATCH /:id`
- **Auth Requerido:** Sí (Bearer Token + Rol Admin)
- **Content-Type:** `multipart/form-data`
- **Body (Todos opcionales):**
  - `name`, `email`, `password`, `role`, `image`

- **Nota:** Si se sube una nueva `image`, la anterior será eliminada de Cloudflare R2.

- **Respuesta Exitosa (200 OK):**
```json
{
  "success": true,
  "message": "Usuario actualizado con éxito",
  "data": { ... }
}
```

---

## 4. Eliminar Usuario
Elimina al usuario permanentemente y borra su foto de perfil de R2.

- **URL:** `DELETE /:id`
- **Auth Requerido:** Sí (Bearer Token + Rol Admin)

- **Respuesta Exitosa (200 OK):**
```json
{
  "success": true,
  "message": "Usuario eliminado con éxito"
}
```

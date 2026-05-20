# 👤 Users — Super-admins

Gestión de usuarios con acceso al panel central del SaaS.

**Base path:** `/api/master/users`

---

## Endpoints

### `POST /login` — Iniciar sesión
> 🔓 Público — no requiere token

Autentica un super-admin y devuelve un JWT.

**Body**
```json
{
  "userName": "superadmin",
  "password": "miContraseña123"
}
```

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "userName": "superadmin",
    "email": "admin@saas.com",
    "name": "Administrador",
    "image": null,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Errores**
| Código | Mensaje |
|---|---|
| `401` | Credenciales inválidas |

---

### `GET /profile` — Perfil del usuario autenticado
> 🔒 Requiere token

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "userName": "superadmin",
    "email": "admin@saas.com",
    "name": "Administrador",
    "image": null,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `PATCH /profile/password` — Cambiar contraseña propia
> 🔒 Requiere token

**Body**
```json
{
  "currentPassword": "contraseñaActual",
  "newPassword": "nuevaContraseña123"
}
```

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Contraseña actualizada correctamente"
}
```

**Errores**
| Código | Mensaje |
|---|---|
| `400` | La contraseña actual es incorrecta |

---

### `GET /` — Listar todos los usuarios
> 🔒 Requiere token

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userName": "superadmin",
      "email": "admin@saas.com",
      "name": "Administrador",
      "image": null,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

> ⚠️ El campo `password` **nunca** se incluye en las respuestas.

---

### `POST /` — Crear usuario
> 🔒 Requiere token

**Body**
```json
{
  "userName": "admin2",
  "email": "admin2@saas.com",
  "password": "contraseña123",
  "name": "Admin Dos",
  "image": "https://cdn.example.com/avatar.png"
}
```

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `userName` | `string` | ✅ | Min 3, solo letras/números/guion bajo |
| `password` | `string` | ✅ | Min 8 caracteres |
| `name` | `string` | ✅ | Max 255 |
| `email` | `string` | ❌ | Formato email válido |
| `image` | `string` | ❌ | URL válida |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "message": "Usuario creado con éxito",
  "data": { ... }
}
```

---

### `GET /:id` — Obtener usuario por ID
> 🔒 Requiere token

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": { ... }
}
```

---

### `PATCH /:id` — Actualizar usuario
> 🔒 Requiere token

**Body** (todos los campos opcionales)
```json
{
  "name": "Nuevo nombre",
  "email": "nuevo@saas.com",
  "image": "https://..."
}
```

---

### `DELETE /:id` — Eliminar usuario
> 🔒 Requiere token

> ⚠️ Un usuario **no puede eliminarse a sí mismo**.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Usuario eliminado correctamente"
}
```

---

## Schema de BD

```ts
// db/master/schema.ts
export const users = pgTable('users', {
  id:        serial('id').primaryKey(),
  userName:  varchar('user_name', { length: 255 }).notNull().unique(),
  email:     varchar('email', { length: 255 }).unique(),
  password:  varchar('password', { length: 255 }).notNull(),
  name:      varchar('name', { length: 255 }).notNull(),
  image:     text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

---

## Payload JWT

```json
{
  "sub": "1",
  "id": 1,
  "userName": "superadmin",
  "role": "super-admin",
  "exp": 1234567890
}
```

El token expira en **7 días**.

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
  "message": "Autorizado",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
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
}
```

**Errores**
```json
{
  "success": false,
  "message": "Credenciales inválidas",
  "data": null
}
```

---

### `GET /profile` — Perfil del usuario autenticado
> 🔒 Requiere token

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Perfil obtenido con éxito",
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
  "message": "Contraseña actualizada correctamente",
  "data": null
}
```

**Errores**
```json
{
  "success": false,
  "message": "La contraseña actual es incorrecta",
  "data": null
}
```

---

### `GET /` — Listar todos los usuarios
> 🔒 Requiere token

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Usuarios obtenidos con éxito",
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
  "data": {
    "id": 2,
    "userName": "admin2",
    "email": "admin2@saas.com",
    "name": "Admin Dos",
    "image": "https://cdn.example.com/avatar.png",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Errores**
```json
{
  "success": false,
  "message": "El nombre de usuario ya está en uso",
  "data": null
}
```

---

### `GET /:id` — Obtener usuario por ID
> 🔒 Requiere token

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Usuario obtenido con éxito",
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

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Usuario actualizado con éxito",
  "data": {
    "id": 1,
    "userName": "superadmin",
    "email": "nuevo@saas.com",
    "name": "Nuevo nombre",
    "image": "https://...",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
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
  "message": "Usuario eliminado correctamente",
  "data": null
}
```

**Errores**
```json
{
  "success": false,
  "message": "No puedes eliminar tu propio usuario",
  "data": null
}
```

---

### `POST /refresh` — Renovar Access Token (Rotación)
> 🔓 Público — no requiere token (lee cookie segura)

Valida la cookie HTTP-Only `master_refresh_token`, elimina el token actual e introduce un nuevo refresh token rotado en la cookie y genera un nuevo access token de corta duración.

**Cookies**
- Requiere `master_refresh_token` (HTTP-Only, Secure, Lax).

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Token renovado con éxito",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
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
}
```

**Errores** (si no se proporciona cookie o si está vencida/inválida)
```json
{
  "success": false,
  "message": "Refresh token no proporcionado",
  "data": null
}
```

---

### `POST /logout` — Cerrar sesión
> 🔓 Público — no requiere token (lee cookie segura)

Elimina el refresh token de la base de datos y destruye la cookie de sesión `master_refresh_token`.

**Cookies**
- Lee `master_refresh_token`.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "message": "Sesión cerrada con éxito",
  "data": null
}
```

---

## Schema de BD

```ts
// db/master/schema.ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  userName: varchar('user_name', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).unique(),
  password: varchar('password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

---

## Seguridad y JWT

- **Access Token (JWT)**: Enviado en la cabecera `Authorization: Bearer <token>`. Expira en **15 minutos**.
- **Refresh Token (Session Cookie)**: Almacenado en la base de datos y enviado de forma segura vía cookie HTTP-Only, Secure, SameSite='Lax' bajo el nombre `master_refresh_token`. Expira en **7 días** y se rota automáticamente con cada llamada a `/refresh`.

**Payload JWT**
```json
{
  "id": 1,
  "userId": 1,
  "userName": "superadmin",
  "role": "super-admin",
  "iat": 1782234000,
  "exp": 1782234900
}
```


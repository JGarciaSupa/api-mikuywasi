# Admin Auth API

Base URL: `/api/admin`

## Headers

| Header | Descripción | Requerido |
|--------|-------------|-----------|
| `x-platform` | `web` o `mobile`. Define cómo se envía el refresh token. Default: `web` | No |
| `Authorization` | `Bearer <accessToken>` para rutas protegidas | Solo en `/profile` |
| `x-refresh-token` | Refresh token (solo en mobile para `/refresh`) | Solo mobile |

---

## Endpoints

### POST `/login`

Autenticación con email y contraseña.

**Body:**
```json
{
  "email": "admin@gmail.com",
  "password": "12345678"
}
```

**Validaciones:**
- `email` — string, email válido, máx 255 caracteres
- `password` — string, mín 1, máx 255 caracteres

**Respuesta exitosa (web):**
> El `refreshToken` se envía automáticamente como cookie `httpOnly`.

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "email": "admin@gmail.com",
      "name": "Super Admin",
      "role": "super-admin",
      "tenantId": null,
      "image": null,
      "createdAt": "2026-03-28T...",
      "updatedAt": "2026-03-28T..."
    }
  }
}
```

**Respuesta exitosa (mobile):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "a1b2c3d4-e5f6-7890-...",
    "user": { ... }
  }
}
```

**Errores:**
| Status | Mensaje |
|--------|---------|
| 400 | Error de validación (primer error de Zod) |
| 401 | Credenciales inválidas |
| 500 | Error interno del servidor |

---

### POST `/refresh`

Renueva el access token usando el refresh token. Aplica **rotación de tokens** (el refresh token anterior se revoca y se genera uno nuevo).

**Web:** el refresh token se lee automáticamente de la cookie.

**Mobile:** enviar el refresh token en el header `x-refresh-token`.

**Respuesta exitosa (web):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": { ... }
  }
}
```

**Respuesta exitosa (mobile):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "nuevo-uuid-...",
    "user": { ... }
  }
}
```

**Errores:**
| Status | Mensaje |
|--------|---------|
| 401 | Refresh token no proporcionado |
| 401 | Refresh token inválido o expirado |
| 500 | Error interno del servidor |

---

### POST `/logout`

Revoca el refresh token actual y elimina la cookie (web).

**Web:** el refresh token se lee de la cookie.

**Mobile:** enviar en body JSON:
```json
{
  "refreshToken": "a1b2c3d4-e5f6-7890-..."
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Sesión cerrada exitosamente"
}
```

---

### GET `/profile` 🔒

Obtiene el perfil del usuario autenticado. Requiere `Authorization: Bearer <accessToken>`.

**Respuesta exitosa:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "admin@gmail.com",
    "name": "Super Admin",
    "role": "super-admin",
    "tenantId": null,
    "image": null,
    "createdAt": "2026-03-28T...",
    "updatedAt": "2026-03-28T..."
  }
}
```

**Errores:**
| Status | Mensaje |
|--------|---------|
| 401 | Token no proporcionado |
| 401 | Token inválido o expirado |
| 401 | Token inválido o expirado |
| 404 | Usuario no encontrado |

---

### PATCH `/profile` 🔒

Actualiza la información del perfil del usuario (nombre e imagen).

**Body:**
```json
{
  "name": "Nuevo Nombre",
  "image": "https://r2.lobitoconsulting.store/avatars/123.jpg"
}
```

**Validaciones:**
- `name` — string, mín 1, máx 255 caracteres
- `image` — string, URL válida, opcional, nullable

**Respuesta exitosa:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "admin@gmail.com",
    "name": "Nuevo Nombre",
    "role": "super-admin",
    "tenantId": null,
    "image": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### PATCH `/password` 🔒

Actualiza la contraseña del usuario.

**Body:**
```json
{
  "currentPassword": "password_actual",
  "newPassword": "nueva_password_123",
  "confirmPassword": "nueva_password_123"
}
```

**Validaciones:**
- `currentPassword` — string, requerido
- `newPassword` — string, mín 6 caracteres
- `confirmPassword` — debe coincidir con `newPassword`

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Contraseña actualizada correctamente"
}
```

---

## Configuración de Tokens

| Token | Expiración | Almacenamiento |
|-------|------------|----------------|
| Access Token (JWT) | 15 minutos | JSON response |
| Refresh Token (UUID) | 15 días | Cookie (web) / JSON + header (mobile) |

## Cookie del Refresh Token (web)

| Propiedad | Valor |
|-----------|-------|
| `httpOnly` | `true` |
| `secure` | `true` en producción |
| `sameSite` | `None` |
| `path` | `/api/admin` |
| `maxAge` | 15 días |

## Variables de Entorno

```env
JWT_SECRET=tu_secreto_jwt
DATABASE_URL=postgresql://...
```

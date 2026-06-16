# Admin Auth API

Base URL: `/api/admin`

## Headers

| Header | Descripción | Requerido |
|--------|-------------|-----------|
| `x-platform` | `web` o `mobile`. Define cómo se envía el refresh token. Default: `web` | No |
| `Authorization` | `Bearer <accessToken>` para rutas protegidas | Solo en rutas 🔒 |
| `x-refresh-token` | Refresh token (solo mobile para `/refresh`) | Solo mobile |

---

## Formato de respuestas

**Error:**
```json
{
  "status": false,
  "message": "Descripción del error"
}
```

**Éxito con datos:**
```json
{
  "status": true,
  "message": "Descripción del resultado",
  "data": { }
}
```

**Éxito sin datos:**
```json
{
  "status": true,
  "message": "Descripción del resultado"
}
```

---

## Endpoints

### POST `/login`

Autenticación con usuario y contraseña.

**Body:**
```json
{
  "username": "admin",
  "password": "12345678"
}
```

**Validaciones:**
- `username` — string, requerido, máx 50 caracteres
- `password` — string, requerido, máx 255 caracteres

**Respuesta exitosa (web):**
> El `refreshToken` se envía automáticamente como cookie `httpOnly`.

```json
{
  "status": true,
  "message": "Inicio de sesión exitoso",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "username": "admin",
      "name": "Super Admin",
      "role": "admin",
      "tenantId": 1,
      "image": null,
      "roleId": null,
      "permissions": {},
      "createdAt": "2026-03-28T...",
      "updatedAt": "2026-03-28T..."
    },
    "branches": [
      {
        "id": 1,
        "name": "Sucursal Principal",
        "code": "SUC01",
        "isMain": true,
        "isActive": true,
        "isDefault": true
      }
    ],
    "currentBranch": {
      "id": 1,
      "name": "Sucursal Principal",
      "code": "SUC01",
      "isMain": true,
      "isActive": true,
      "isDefault": true
    }
  }
}
```

**Respuesta exitosa (mobile):**
```json
{
  "status": true,
  "message": "Inicio de sesión exitoso",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "a1b2c3d4-e5f6-7890-...",
    "user": { "...": "..." },
    "branches": [ { "...": "..." } ],
    "currentBranch": { "...": "..." }
  }
}
```

**Errores:**
| Status | Mensaje |
|--------|---------|
| 400 | Primer error de validación Zod (ej: "El nombre de usuario es requerido") |
| 401 | Credenciales inválidas |
| 500 | Error interno del servidor |

---

### POST `/refresh`

Renueva el access token usando el refresh token. Aplica **rotación de tokens** (el token anterior se revoca y se genera uno nuevo).

**Web:** el refresh token se lee automáticamente de la cookie.

**Mobile:** enviar el refresh token en el header `x-refresh-token`.

**Respuesta exitosa (web):**
```json
{
  "status": true,
  "message": "Token actualizado exitosamente",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "...": "..." },
    "branches": [ { "...": "..." } ],
    "currentBranch": { "...": "..." }
  }
}
```

**Respuesta exitosa (mobile):**
```json
{
  "status": true,
  "message": "Token actualizado exitosamente",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "nuevo-uuid-...",
    "user": { "...": "..." },
    "branches": [ { "...": "..." } ],
    "currentBranch": { "...": "..." }
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
  "status": true,
  "message": "Sesión cerrada exitosamente"
}
```

> Nota: este endpoint siempre responde con éxito, incluso si el token ya estaba revocado o no existía.

---

### GET `/profile` 🔒

Obtiene el perfil del usuario autenticado. Requiere `Authorization: Bearer <accessToken>`.

**Respuesta exitosa:**
```json
{
  "status": true,
  "message": "Perfil obtenido exitosamente",
  "data": {
    "id": 1,
    "username": "admin",
    "name": "Super Admin",
    "role": "admin",
    "tenantId": 1,
    "image": null,
    "roleId": null,
    "permissions": {},
    "branches": [
      {
        "id": 1,
        "name": "Sucursal Principal",
        "code": "SUC01",
        "isMain": true,
        "isActive": true,
        "isDefault": true
      }
    ],
    "currentBranch": { "...": "..." },
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
| 404 | Usuario no encontrado |
| 500 | Error interno del servidor |

---

### PATCH `/profile` 🔒

Actualiza nombre e imagen de perfil. Body como `multipart/form-data`.

**Campos:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `name` | string | Sí | Nombre del usuario, mín 1, máx 255 caracteres |
| `image` | File | No | Archivo de imagen (se sube a R2 y reemplaza la anterior) |

**Respuesta exitosa:**
```json
{
  "status": true,
  "message": "Perfil actualizado correctamente",
  "data": {
    "id": 1,
    "username": "admin",
    "name": "Nuevo Nombre",
    "role": "admin",
    "tenantId": 1,
    "image": "https://r2.ejemplo.com/profile/abc123.webp",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Errores:**
| Status | Mensaje |
|--------|---------|
| 400 | El nombre es requerido |
| 400 | El nombre no puede exceder los 255 caracteres |
| 401 | Token no proporcionado / Token inválido o expirado |
| 404 | Usuario no encontrado |
| 500 | Error interno del servidor |

---

### PATCH `/password` 🔒

Actualiza la contraseña del usuario autenticado.

**Body:**
```json
{
  "currentPassword": "contraseña_actual",
  "newPassword": "nueva_contraseña_123",
  "confirmPassword": "nueva_contraseña_123"
}
```

**Validaciones:**
| Campo | Regla |
|-------|-------|
| `currentPassword` | string, requerido |
| `newPassword` | string, mín 6, máx 255 caracteres |
| `confirmPassword` | debe coincidir exactamente con `newPassword` |

**Respuesta exitosa:**
```json
{
  "status": true,
  "message": "Contraseña actualizada correctamente"
}
```

**Errores:**
| Status | Mensaje |
|--------|---------|
| 400 | La contraseña actual es requerida |
| 400 | La nueva contraseña es requerida |
| 400 | La nueva contraseña debe tener al menos 6 caracteres |
| 400 | La nueva contraseña no puede exceder los 255 caracteres |
| 400 | La confirmación de la contraseña es requerida |
| 400 | Las contraseñas no coinciden |
| 400 | La contraseña actual es incorrecta |
| 401 | Token no proporcionado / Token inválido o expirado |
| 404 | Usuario no encontrado |
| 500 | Error interno del servidor |

---

## Configuración de Tokens

| Token | Expiración | Almacenamiento |
|-------|------------|----------------|
| Access Token (JWT) | 15 minutos | JSON response (`data.accessToken`) |
| Refresh Token (UUID) | 15 días | Cookie httpOnly (web) / JSON response (mobile) |

## Cookie del Refresh Token (web)

| Propiedad | Valor |
|-----------|-------|
| `httpOnly` | `true` |
| `secure` | `true` en producción |
| `sameSite` | `None` |
| `path` | `/` |
| `maxAge` | 15 días (1 296 000 s) |

## Variables de Entorno

```env
JWT_SECRET=tu_secreto_jwt
DATABASE_URL=postgresql://...
```

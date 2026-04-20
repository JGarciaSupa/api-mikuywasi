# Tenant Settings API

Endpoints para gestionar la configuración de un tenant (negocio).

**Ruta base:** `/api/admin/settings`

## 1. Obtener Configuración
Retorna los datos del tenant actual basado en el token de autenticación.

- **URL:** `/`
- **Método:** `GET`
- **Auth Requerida:** Sí (Admin)

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "slug": "mi-negocio",
    "name": "Mi Negocio",
    "logo": "https://...",
    "primaryColor": "#ef4444",
    "secondaryColor": "#1e293b",
    "accentColor": "#f59e0b",
    "phone": "+51...",
    "whatsapp": "+51...",
    "email": "hola@...",
    "category": "Restaurante",
    "address": {
      "fullAddress": "Av. ...",
      "lat": -12.1191,
      "lng": -77.0286
    },
    "schedules": [
      { "day": "Lunes", "startTime": "09:00", "endTime": "22:00", "closed": false },
      ...
    ],
    "hasDelivery": true,
    "hasPickup": true,
    "hasDineIn": true,
    "hasLiveTracking": false,
    "minOrderAmount": "0.00",
    "defaultDeliveryFee": "5.00",
    "freeDeliveryThreshold": "50.00",
    "planId": 1,
    "planStartsAt": "...",
    "planEndsAt": "...",
    "billingCycle": "monthly",
    "status": "active",
    "ownerName": "...",
    "ownerPhone": "...",
    "fiscalId": "...",
    "fiscalName": "...",
    "createdAt": "...",
    "updatedAt": "...",
    "plan": {
      "id": 1,
      "name": "Premium",
      ...
    }
  }
}
```

---

---

## 2. Actualizar Información Pública
Actualiza los datos básicos y la identidad visual del negocio.

- **URL:** `/info`
- **Método:** `PATCH`
- **Auth Requerida:** Sí (Admin)
- **Cuerpo (JSON):**
```json
{
  "name": "Nuevo Nombre",
  "category": "Pizzería",
  "phone": "+51999888777",
  "whatsapp": "+51999888777",
  "email": "hola@negocio.com",
  "primaryColor": "#ef4444",
  "secondaryColor": "#1e293b",
  "accentColor": "#f59e0b"
}
```

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "message": "Información pública actualizada con éxito",
  "data": { ... }
}
```

---

## 3. Gestión de Logo

### 3.1 Actualizar/Subir Logo
Sube una nueva imagen de logo y actualiza el tenant.

- **URL:** `/logo`
- **Método:** `POST`
- **Auth Requerida:** Sí (Admin)
- **Cuerpo (Multipart Form Data):**
    - `logo`: Archivo de imagen.

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "message": "Logo actualizado con éxito",
  "data": { ... }
}
```

### 3.2 Eliminar Logo
Elimina el logo actual y limpia la referencia en la base de datos.

- **URL:** `/logo`
- **Método:** `DELETE`
- **Auth Requerida:** Sí (Admin)

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "message": "Logo eliminado con éxito",
  "data": { ... }
}
```

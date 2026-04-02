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

## 2. Actualizar Configuración
Actualiza los campos permitidos del tenant.

- **URL:** `/`
- **Método:** `PATCH`
- **Auth Requerida:** Sí (Admin)
- **Cuerpo (JSON):** Todos los campos son opcionales.

### Ejemplo de Cuerpo
```json
{
  "name": "Nuevo Nombre",
  "phone": "+51999888777",
  "hasDelivery": false,
  "address": {
    "fullAddress": "Nueva Calle 123",
    "lat": -12.00,
    "lng": -77.00
  },
  "schedules": [
    { "day": "Lunes", "startTime": "10:00", "endTime": "23:00", "closed": false }
  ]
}
```

### Respuesta Exitosa (200 OK)
```json
{
  "success": true,
  "message": "Configuración actualizada con éxito",
  "data": { ... }
}
```

---

## 3. Actualizar Logo
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

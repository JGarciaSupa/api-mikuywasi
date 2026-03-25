# Documentación de la API de Super Admin

Este documento describe los endpoints de la API disponibles para el rol de Super Admin.

## URL Base
`/api/super-admin`

---

## Autenticación

### Iniciar Sesión (Login)
Autentica a un super admin y establece las cookies de sesión.
- **URL:** `/login`
- **Método:** `POST`
- **Cuerpo (Body):**
  ```json
  {
    "email": "admin@example.com",
    "password": "tu_contraseña"
  }
  ```
- **Respuesta (200 OK):**
  ```json
  {
    "success": true,
    "user": { "id": 1, "name": "Admin", "email": "admin@example.com" }
  }
  ```

### Refrescar Token
Refresca el token de acceso utilizando la cookie de actualización.
- **URL:** `/refresh-token`
- **Método:** `POST`
- **Respuesta (200 OK):**
  ```json
  { "success": true }
  ```

### Cerrar Sesión (Logout)
Limpia las cookies de autenticación.
- **URL:** `/logout`
- **Método:** `POST`
- **Respuesta (200 OK):**
  ```json
  { "success": true }
  ```

### Usuario Actual
Devuelve información sobre el super admin autenticado.
- **URL:** `/me`
- **Método:** `GET`
- **Requiere Autenticación:** Sí
- **Respuesta (200 OK):**
  ```json
  { "id": 1, "name": "Admin", "email": "admin@example.com" }
  ```

---

## Tenants (Clientes del Sistema)

### Listar Tenants
Devuelve una lista de todos los tenants y sus planes asignados.
- **URL:** `/tenants`
- **Método:** `GET`
- **Requiere Autenticación:** Sí
- **Respuesta (200 OK):** Arreglo de objetos tenant.

### Crear Tenant
Crea un nuevo tenant y, opcionalmente, un usuario administrador para el mismo.
- **URL:** `/tenants`
- **Método:** `POST`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):**
  ```json
  {
    "name": "Nombre del Restaurante",
    "slug": "slug-del-restaurante",
    "planId": 1,
    "status": "active",
    "trialEnding": "2024-12-31T23:59:59Z",
    "userName": "Nombre del Administrador",
    "userEmail": "admin@restaurante.com",
    "userPassword": "contraseña123"
  }
  ```

### Actualizar Estado del Tenant
Actualiza el estado de un tenant específico.
- **URL:** `/tenants/:id/status`
- **Método:** `PATCH`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):**
  ```json
  { "status": "active" | "suspended" | "trial" }
  ```

### Actualizar Fin de Prueba (Trial)
Actualiza la fecha de expiración de la prueba para un tenant específico.
- **URL:** `/tenants/:id/trial`
- **Método:** `PATCH`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):**
  ```json
  { "trialEnding": "2024-12-31T23:59:59Z" }
  ```

---

## Planes

### Listar Planes
Devuelve una lista de los planes disponibles.
- **URL:** `/plans`
- **Método:** `GET`
- **Requiere Autenticación:** Sí
- **Respuesta (200 OK):** Arreglo de objetos de plan.

### Crear Plan
Crea un nuevo plan de suscripción.
- **URL:** `/plans`
- **Método:** `POST`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):**
  ```json
  {
    "name": "Plan Pro",
    "monthlyPrice": "29.99",
    "yearlyPrice": "299.99",
    "features": ["Característica 1", "Característica 2"],
    "order": 1
  }
  ```

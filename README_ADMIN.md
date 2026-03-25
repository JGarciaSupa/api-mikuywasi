# Documentación de la API de Admin

Este documento describe los endpoints de la API disponibles para el rol de Admin (Comercio).

## URL Base
`/api/admin`

---

## Autenticación

### Login Web
Autentica a un usuario administrador y establece cookies de sesión para el tablero web.
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
    "user": { "id": 1, "name": "Admin", "email": "admin@example.com", "tenantId": 1 }
  }
  ```

### Refrescar Token Web
Refresca el token de acceso utilizando la cookie de actualización.
- **URL:** `/refresh-token`
- **Método:** `POST`
- **Respuesta (200 OK):**
  ```json
  { "success": true }
  ```

### Login Móvil
Autentica a un usuario administrador y devuelve los tokens en el cuerpo de la respuesta (para aplicaciones móviles).
- **URL:** `/mobile/login`
- **Método:** `POST`
- **Cuerpo (Body):** Igual que el Login.
- **Respuesta (200 OK):**
  ```json
  {
    "success": true,
    "accessToken": "...",
    "refreshToken": "...",
    "user": { "id": 1, "name": "Admin", "email": "admin@example.com", "tenantId": 1 }
  }
  ```

### Refrescar Token Móvil
Refresca los tokens y los devuelve en el cuerpo de la respuesta.
- **URL:** `/mobile/refresh-token`
- **Método:** `POST`
- **Cuerpo (Body):**
  ```json
  { "refreshToken": "..." }
  ```
- **Respuesta (200 OK):**
  ```json
  { "success": true, "accessToken": "...", "refreshToken": "..." }
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
Devuelve información sobre el usuario administrador autenticado.
- **URL:** `/me`
- **Método:** `GET`
- **Requiere Autenticación:** Sí
- **Respuesta (200 OK):**
  ```json
  { "id": 1, "name": "Admin", "email": "admin@example.com", "tenantId": 1, "role": "admin" }
  ```

---

## Gestión del Perfil

### Obtener Perfil
Devuelve el perfil del tenant, incluyendo banners y enlaces sociales.
- **URL:** `/profile`
- **Método:** `GET`
- **Requiere Autenticación:** Sí

### Actualizar Perfil
Actualiza la información del perfil del tenant.
- **URL:** `/profile`
- **Método:** `PATCH`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):**
  ```json
  {
    "name": "Nombre del Restaurante",
    "logo": "url-del-logo",
    "primaryColor": "#ff0000",
    "secondaryColor": "#00ff00",
    "accentColor": "#0000ff",
    "phone": "123456789",
    "whatsapp": "123456789",
    "email": "info@restaurante.com",
    "address": "Calle 123"
  }
  ```

---

## Categorías

### Listar Categorías
Devuelve todas las categorías del tenant.
- **URL:** `/categories`
- **Método:** `GET`
- **Requiere Autenticación:** Sí

### Crear Categoría
Crea una nueva categoría.
- **URL:** `/categories`
- **Método:** `POST`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):**
  ```json
  {
    "name": "Hamburguesas",
    "order": 1,
    "isActive": true,
    "startTime": "08:00:00",
    "endTime": "22:00:00",
    "availableDays": [1, 2, 3, 4, 5, 6, 7]
  }
  ```

### Actualizar Categoría
Actualiza una categoría.
- **URL:** `/categories/:id`
- **Método:** `PATCH`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):** Igual que Crear Categoría.

### Eliminar Categoría
Elimina una categoría.
- **URL:** `/categories/:id`
- **Método:** `DELETE`
- **Requiere Autenticación:** Sí

---

## Productos

### Listar Productos
Devuelve todos los productos del tenant, incluyendo alternativas, acompañamientos (sides) y categorías.
- **URL:** `/products`
- **Método:** `GET`
- **Requiere Autenticación:** Sí

### Crear Producto
Crea un nuevo producto.
- **URL:** `/products`
- **Método:** `POST`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):**
  ```json
  {
    "name": "Cheeseburger",
    "description": "Deliciosa hamburguesa con queso",
    "price": "10.00",
    "discountPrice": "8.00",
    "image": "url-de-la-imagen",
    "order": 1,
    "categoryId": 1,
    "isActive": true,
    "alternatives": [
      { "name": "Doble", "price": "12.00" }
    ],
    "sides": [
      { "name": "Papas Fritas", "price": "2.00" }
    ]
  }
  ```

### Actualizar Producto
Actualiza un producto.
- **URL:** `/products/:id`
- **Método:** `PATCH`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):** Igual que Crear Producto.

### Eliminar Producto
Elimina un producto y sus datos relacionados.
- **URL:** `/products/:id`
- **Método:** `DELETE`
- **Requiere Autenticación:** Sí

---

## Pedidos (Orders)

### Listar Pedidos
Devuelve todos los pedidos del tenant, incluyendo artículos y productos relacionados.
- **URL:** `/orders`
- **Método:** `GET`
- **Requiere Autenticación:** Sí

### Actualizar Estado del Pedido
Actualiza el estado de un pedido.
- **URL:** `/orders/:id/status`
- **Método:** `PATCH`
- **Requiere Autenticación:** Sí
- **Cuerpo (Body):**
  ```json
  { "status": "pending" | "preparing" | "shipped" | "completed" | "canceled" }
  ```

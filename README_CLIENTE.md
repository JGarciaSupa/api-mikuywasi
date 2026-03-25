# Documentación de la API de Cliente

Este documento describe los endpoints de la API disponibles para el rol de Cliente.

## URL Base
`/api/cliente`

---

## Información del Menú

### Obtener Menú por Slug
Devuelve la información del tenant, categorías y productos basándose en el slug.
- **URL:** `/tenant/:slug`
- **Método:** `GET`
- **Respuesta (200 OK):** Objeto tenant que contiene:
  - Banners
  - Enlaces Sociales
  - Categorías (incluyendo Productos con Alternativas y Acompañamientos)

---

## Realización de Pedidos

### Crear Pedido
Crea un nuevo pedido para un tenant.
- **URL:** `/orders`
- **Método:** `POST`
- **Cuerpo (Body):**
  ```json
  {
    "tenantId": 1,
    "customerName": "Juan Pérez",
    "tableNumber": "5",
    "total": "25.00",
    "items": [
      {
        "productId": 1,
        "quantity": 2,
        "price": "10.00",
        "selectedAlternative": {
          "name": "Doble",
          "price": "12.00"
        }
      }
    ]
  }
  ```
- **Respuesta (201 Created):**
  ```json
  {
    "success": true,
    "orderId": 1
  }
  ```

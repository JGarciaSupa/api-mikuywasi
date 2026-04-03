# API de Clientes (Pública)

Esta documentación describe los endpoints públicos utilizados por la aplicación cliente (frontend de los restaurantes).

## Rate Limiting
Todos los endpoints públicos tienen un límite de **100 peticiones por minuto** por dirección IP. Si se excede este límite, el servidor responderá con un código `429 Too Many Requests`.

---

## 1. Obtener información del Tenant (Restaurante)

Obtiene la configuración pública, logo, colores, banners y redes sociales de un restaurante basado en su `slug`.

- **URL:** `/api/client/tenant/:slug`
- **Method:** `GET`
- **Auth required:** No
- **Rate Limit:** 100 req/min

### Parámetros de URL
| Parámetro | Tipo | Descripción |
| :--- | :--- | :--- |
| `slug` | `string` | El identificador único del restaurante (e.g., `pizzeria-del-sol`). |

### Ejemplo de Respuesta (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "slug": "pizzeria-del-sol",
    "name": "Pizzería del Sol",
    "logo": "https://r2.pedidosqr.com/logos/pizzeria.png",
    "primaryColor": "#ff5733",
    "secondaryColor": "#c70039",
    "accentColor": "#900c3f",
    "phone": "987654321",
    "whatsapp": "987654321",
    "email": "contacto@pizzeria.com",
    "category": "Pizzería",
    "address": {
      "fullAddress": "Av. Larco 123, Miraflores",
      "lat": -12.1212,
      "lng": -77.0304
    },
    "hasDelivery": true,
    "hasPickup": true,
    "hasDineIn": true,
    "banners": [
      { "id": 1, "url": "https://r2...", "order": 0 }
    ],
    "socialLinks": [
      { "id": 1, "platform": "facebook", "url": "https://fb.com/...", "order": 0, "isActive": true }
    ]
  }
}
```

### Respuestas de Error
| Código | Descripción |
| :--- | :--- |
| `400 Bad Request` | Falta el parámetro `slug`. |
| `404 Not Found` | El restaurante no existe o el `slug` es incorrecto. |
| `429 Too Many Requests` | Demasiadas peticiones. Intente de nuevo en 1 minuto. |
| `500 Internal Server Error` | Error inesperado en el servidor. |

---

## 2. Obtener Menú (Categorías y Productos)

Obtiene todas las categorías activas y sus productos asociados para un restaurante, agrupados por categoría. Los productos que no tengan una categoría asignada se incluirán al final en un objeto con `id` y `name` en `null`.

- **URL:** `/api/client/menu/:slug`
- **Method:** `GET`
- **Auth required:** No
- **Rate Limit:** 100 req/min

### Parámetros de URL
| Parámetro | Tipo | Descripción |
| :--- | :--- | :--- |
| `slug` | `string` | El identificador único del restaurante. |

### Ejemplo de Respuesta (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "tenantId": 1,
      "name": "Entradas",
      "order": 0,
      "isActive": true,
      "startTime": "08:00:00",
      "endTime": "23:00:00",
      "availableDays": [0, 1, 2, 3, 4, 5, 6],
      "products": [
        {
          "id": 1,
          "tenantId": 1,
          "categoryId": 1,
          "name": "Pan al ajo",
          "description": "Pan tostado con mantequilla de ajo",
          "price": "10.00",
          "discountPrice": null,
          "packagingFee": "0.00",
          "image": "https://r2...",
          "order": 0,
          "isActive": true
        }
      ]
    },
    {
      "id": null,
      "tenantId": 1,
      "name": null,
      "order": 999,
      "isActive": true,
      "products": [
        {
          "id": 10,
          "name": "Bebida genérica",
          "price": "5.00",
          "categoryId": null
        }
      ]
    }
  ]
}
```

### Respuestas de Error
| Código | Descripción |
| :--- | :--- |
| `400 Bad Request` | Falta el parámetro `slug`. |
| `404 Not Found` | El restaurante no existe. |
| `500 Internal Server Error` | Error inesperado al obtener el menú. |

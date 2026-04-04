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

---

## 3. Obtener Mesas del Restaurante

Obtiene todas las mesas configuradas para un restaurante basándose en su `slug`.

- **URL:** `/api/client/tables/:slug`
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
      "name": "Mesa 1",
      "slug": "m1-abc",
      "createdAt": "2024-03-20T10:00:00Z",
      "updatedAt": "2024-03-20T10:00:00Z",
      "tenantId": 1
    },
    {
      "id": 2,
      "name": "Mesa 2",
      "slug": "m2-xyz",
      "createdAt": "2024-03-20T10:05:00Z",
      "updatedAt": "2024-03-20T10:05:00Z",
      "tenantId": 1
    }
  ]
}
```

### Respuestas de Error
| Código | Descripción |
| :--- | :--- |
| `400 Bad Request` | Falta el parámetro `slug`. |
| `404 Not Found` | El restaurante no existe. |
| `500 Internal Server Error` | Error inesperado al obtener las mesas. |

---

## 4. Obtener Métodos de Pago del Restaurante

Obtiene todos los métodos de pago activos configurados para un restaurante basándose en su `slug`.

- **URL:** `/api/client/payment-methods/:slug`
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
      "name": "Efectivo",
      "isActive": true,
      "createdAt": "2024-03-20T10:00:00Z",
      "updatedAt": "2024-03-20T10:00:00Z",
      "tenantId": 1
    },
    {
      "id": 2,
      "name": "Yape/Plin",
      "isActive": true,
      "createdAt": "2024-03-20T10:05:00Z",
      "updatedAt": "2024-03-20T10:05:00Z",
      "tenantId": 1
    }
  ]
}
```

### Respuestas de Error
| Código | Descripción |
| :--- | :--- |
| `400 Bad Request` | Falta el parámetro `slug`. |
| `404 Not Found` | El restaurante no existe. |
| `500 Internal Server Error` | Error inesperado al obtener los métodos de pago. |
---
 
 ## 5. Crear Pedido
 
 Registra un nuevo pedido en el sistema para un restaurante específico. El pedido puede ser de tipo `delivery`, `pickup` o `dine_in`.
 
 - **URL:** `/api/client/orders`
 - **Method:** `POST`
 - **Auth required:** No
 - **Rate Limit:** 300 req/min
 
 ### Cuerpo de la Petición (Request Body)
 | Campo | Tipo | Descripción |
 | :--- | :--- | :--- |
 | `tenantId` | `number` | ID del restaurante (obtenido del endpoint de información del tenant). |
 | `customerName` | `string` | Nombre del cliente. |
 | `customerPhone` | `string` | Teléfono de contacto del cliente. |
 | `customerAddress` | `string?` | Dirección de entrega (obligatorio para `delivery`). |
 | `deliveryType` | `string` | Tipo de entrega: `delivery`, `pickup`, `dine_in`. |
 | `deliveryInfo` | `object?` | Información adicional de entrega: `{ "lat": number, "lng": number, "reference": string }`. |
 | `tableId` | `number?` | ID de la mesa (si aplica). |
 | `tableName` | `string?` | Nombre de la mesa. |
 | `paymentMethod` | `string` | Nombre del método de pago seleccionado. |
 | `notes` | `string?` | Nota general para el pedido. |
 | `subtotal` | `number` | Suma de precios unitarios por cantidades. |
 | `deliveryFee` | `number` | Costo de envío (opcional, por defecto 0). |
 | `total` | `number` | Monto total a pagar. |
 | `items` | `array` | Lista de productos pedidos (ver estructura abajo). |
 
 #### Estructura de `items`
 Each item in the array should contain:
 - `productId`: ID del producto.
 - `productName`: Nombre del producto.
 - `unitPrice`: Precio unitario cobrado.
 - `quantity`: Cantidad pedida.
 - `packagingFee`: (Opcional) Cargo adicional por empaque.
 - `notes`: Nota específica para este producto.
 - `totalPrice`: (unitPrice * quantity) + extras.
 - `selectedAlternatives`: (Opcional) Array de `{ name: string, extraPrice: number }`.
 
 ### Ejemplo de Petición
 ```json
 {
   "tenantId": 1,
   "customerName": "Juan Pérez",
   "customerPhone": "987654321",
   "customerAddress": "Av. Larco 123",
   "deliveryType": "delivery",
   "deliveryInfo": {
     "lat": -12.12,
     "lng": -77.03,
     "reference": "Frente al parque"
   },
   "paymentMethod": "Efectivo",
   "subtotal": 45.50,
   "total": 45.50,
   "items": [
     {
       "productId": 5,
       "productName": "Pizza Familiar",
       "unitPrice": 45.50,
       "quantity": 1,
       "notes": "Sin cebolla",
       "totalPrice": 45.50,
       "selectedAlternatives": [
         { "name": "Masa delgada", "extraPrice": 0 }
       ]
     }
   ]
 }
 ```
 
 ### Ejemplo de Respuesta (201 Created)
 ```json
 {
   "success": true,
   "message": "Pedido creado exitosamente",
   "data": {
     "orderId": "k3j4l5m6n7p8",
     "trackingCode": "ORD-7USIVD6N"
   }
 }
 ```
 
 ### Respuestas de Error
 | Código | Descripción |
 | :--- | :--- |
 | `400 Bad Request` | Error de validación en los datos enviados o falta el `tenantId`. |
 | `404 Not Found` | El restaurante (`tenantId`) no existe. |
 | `500 Internal Server Error` | Error inesperado al procesar la orden o fallo en la transacción. |

# Identificación de Tenant - Guía para Frontend

## 📋 Resumen

El backend usa un sistema **multi-tenant** donde cada tenant tiene su propia base de datos. El middleware automáticamente detecta cuál tenant está realizando la solicitud basándose en los parámetros que envíes.

---

## 🔍 Formas de Identificar el Tenant

### **Opción 1: Query Parameter `tenantId` (Admin/Rutas Protegidas)**

Para endpoints admin (`/api/admin/*`), envía el `tenantId` como query parameter:

```
GET /api/admin/categories?tenantId=1
POST /api/admin/products?tenantId=1&name=Pizza
PATCH /api/admin/settings/1?tenantId=1
```

**Ejemplo con fetch:**
```javascript
const tenantId = 1;
const response = await fetch(`/api/admin/categories`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  }
});
```

---

### **Opción 2: Header `X-Tenant-ID` (Alternativa)**

Si prefieres no enviar por URL, usa el header `X-Tenant-ID`:

```javascript
const response = await fetch('/api/admin/categories', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'X-Tenant-ID': '1'
  }
});
```

---

### **Opción 3: Slug del Tenant (Client/Rutas Públicas)**

Para endpoints públicos (`/api/client/*`), usa el `slug` del tenant en la URL:

```
GET /api/client/tenant/pizzeria-downtown
GET /api/client/menu/pizzeria-downtown
GET /api/client/tables/pizzeria-downtown
POST /api/client/orders
```

**Ejemplo:**
```javascript
const tenantSlug = 'pizzeria-downtown';
const response = await fetch(`/api/client/menu/${tenantSlug}`, {
  method: 'GET'
});
```

---

## 🎯 Cuándo Usar Cada Una

| Endpoint | Método | Identificación |
|----------|--------|-----------------|
| `/api/admin/*` | Query param o Header | `?tenantId=1` o Header `X-Tenant-ID` |
| `/api/client/*` | Path param | `/api/client/menu/:slug` |

---

## 🚀 Ejemplos Completos

### **Obtener Categorías (Admin)**
```javascript
async function getCategoriesAdmin(tenantId, accessToken) {
  const response = await fetch(`/api/admin/categories?tenantId=${tenantId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
}

// Uso
const categories = await getCategoriesAdmin(1, 'mi-token-jwt');
```

---

### **Crear Categoría (Admin)**
```javascript
async function createCategoryAdmin(tenantId, categoryData, accessToken) {
  const response = await fetch(`/api/admin/categories?tenantId=${tenantId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: categoryData.name,
      order: categoryData.order
    })
  });
  return response.json();
}

// Uso
const newCategory = await createCategoryAdmin(1, {
  name: 'Pizzas',
  order: 1
}, 'mi-token-jwt');
```

---

### **Obtener Menú (Client)**
```javascript
async function getMenu(tenantSlug) {
  const response = await fetch(`/api/client/menu/${tenantSlug}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  return response.json();
}

// Uso
const menu = await getMenu('pizzeria-downtown');
```

---

### **Crear Orden (Client)**
```javascript
async function createOrder(orderData, tenantSlug) {
  const response = await fetch('/api/client/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantSlug  // O pasar como query param
    },
    body: JSON.stringify(orderData)
  });
  return response.json();
}

// Uso
const order = await createOrder({
  customerName: 'Juan',
  items: [...]
}, 'pizzeria-downtown');
```

---

## ⚙️ Cómo Funciona Internamente

1. **Frontend envía**: `GET /api/admin/categories?tenantId=1`

2. **Middleware (`tenantContextMiddleware`) intercepta**:
   - Extrae `tenantId=1` del query param
   - Busca el tenant en la BD master
   - Obtiene la connection string del servidor asignado
   - Establece la conexión a la BD del tenant

3. **Servicio accede automáticamente**:
   ```javascript
   export async function getAllCategories() {
     const db = getTenantDb(); // ← Obtiene la BD del tenant automáticamente
     return await db.select().from(categories).orderBy(...);
   }
   ```

4. **Frontend recibe**: `{ success: true, data: [...] }`

---

## 🔐 Seguridad

- **Para Admin**: El `tenantId` se valida junto con el JWT
- **Para Client**: El `slug` se valida contra la BD master
- **Sin identificación**: El request falla con `400 - Tenant ID requerido`
- **Tenant inválido**: El request falla con `404 - Tenant no encontrado`

---

## 📱 Ejemplo en React

```javascript
import { useState } from 'react';

export function AdminPanel({ tenantId, accessToken }) {
  const [categories, setCategories] = useState([]);

  async function loadCategories() {
    try {
      const response = await fetch(
        `/api/admin/categories?tenantId=${tenantId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      const data = await response.json();
      setCategories(data.data);
    } catch (error) {
      console.error('Error:', error);
    }
  }

  return (
    <div>
      <button onClick={loadCategories}>Cargar Categorías</button>
      <ul>
        {categories.map(cat => <li key={cat.id}>{cat.name}</li>)}
      </ul>
    </div>
  );
}
```

---

## ❓ Preguntas Frecuentes

**P: ¿Debo pasar tenantId en CADA request?**  
R: Sí, el middleware lo necesita para identificar cuál BD usar. Es rápido y seguro.

**P: ¿Qué pasa si no envío tenantId?**  
R: La API devuelve: `{ success: false, message: "Tenant ID requerido" }` con status 400.

**P: ¿Puedo usar slug en rutas admin?**  
R: Técnicamente sí, el middleware lo soporta. Pero por convención, usa `tenantId` en admin.

**P: ¿Dónde obtengo el tenantId/slug?**  
R: Del login o de la BD master. El tenant lo proporciona cuando se autentica.

---

## 🎓 Resumen Rápido

```
┌─────────────────┐
│   Frontend      │
└────────┬────────┘
         │
         │ GET /api/admin/categories?tenantId=1
         │ Header: Authorization: Bearer token
         │
         ▼
┌──────────────────────────┐
│  tenantContextMiddleware │ ← Detecta tenantId=1
└────────┬─────────────────┘
         │
         │ Busca tenant en BD Master
         │ Obtiene connection string
         │ Abre conexión a BD del Tenant
         │
         ▼
┌──────────────────┐
│  Service Layer   │ ← const db = getTenantDb()
└────────┬─────────┘
         │
         │ Query a BD del Tenant
         │
         ▼
┌─────────────────┐
│    Frontend     │ ← { success: true, data: [...] }
└─────────────────┘
```

---

**¿Preguntas?** Revisa los ejemplos arriba o pregunta al equipo de backend.

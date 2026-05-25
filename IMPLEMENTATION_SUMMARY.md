# Implementación Multi-Tenant — Resumen Ejecutivo

Sistema **multi-tenant global y automático** donde cada tenant tiene su propia base de datos aislada y el middleware se encarga de identificar y conectarse automáticamente.

---

## Arquitectura

### Contexto Global (AsyncLocalStorage)
**Archivo:** `src/utils/tenant-context.ts`

```typescript
getTenantDb()           // Obtiene la conexión de la BD del tenant
getTenantId()           // Obtiene el ID del tenant actual
getTenantContext()      // Acceso al contexto completo
runWithTenantContext()  // Ejecuta código dentro del contexto
```

**Ventaja:** Los servicios acceden a la BD sin pasar parámetros entre capas.

### Middleware de Contexto
**Archivo:** `src/core/tenant/middleware/tenant-context.middleware.ts`

Responsabilidades:
1. Extrae el identificador del tenant (`tenantId` o `slug`) del request
2. Busca el tenant en la BD master
3. Obtiene la connection string del servidor asignado
4. Establece la conexión a la BD específica del tenant
5. Almacena todo en contexto global (AsyncLocalStorage)

Aplicado en:
- `src/core/tenant/routes/admin/index.ts` — Rutas admin
- `src/core/tenant/routes/client/index.ts` — Rutas cliente

### Patrón de Servicio

```typescript
// ANTES
import { db } from '../../../../db';
import { categories } from '../../../../db/schema';

export async function getAllCategories(tenantId: number) {
  return await db.select().from(categories)
    .where(eq(categories.tenantId, tenantId));
}

// DESPUÉS
import { categories } from '../../../../db/tenant/schema';
import { getTenantDb } from '../../../../utils/tenant-context';

export async function getAllCategories() {
  const db = getTenantDb();
  return await db.select().from(categories);
}
```

---

## Flujo de Ejecución

```
CLIENTE
  GET /api/admin/categories
  Header: X-Tenant-ID: 1
         │
         ▼
tenantContextMiddleware
  • Extrae tenantId del request
  • Busca tenant en BD master
  • Obtiene connection string
  • Abre conexión a BD del tenant
  • Crea contexto AsyncLocalStorage
         │
         ▼
Controller
  • Llama service sin parámetros
  await getAllCategories()
         │
         ▼
Service
  const db = getTenantDb()  ← Del contexto
  • Ejecuta query en BD del tenant
         │
         ▼
{ success: true, data: [...] }
```

---

## Módulos Implementados

### Módulo Admin — Restaurante

| Módulo | Rutas | Archivo de servicio |
|--------|-------|---------------------|
| Auth | `POST /login`, `POST /refresh`, `POST /logout` | `services/admin/auth.service.ts` |
| Categorías | CRUD + reorder | `services/admin/categories.service.ts` |
| Productos | CRUD + reorder | `services/admin/products.service.ts` |
| Mesas | CRUD | `services/admin/tables.service.ts` |
| Métodos de pago | CRUD | `services/admin/payment-method.service.ts` |
| Banners | CRUD + reorder | `services/admin/banners.service.ts` |
| Redes sociales | CRUD + reorder | `services/admin/social-networks.service.ts` |
| Personal (staff) | CRUD | `services/admin/staff.service.ts` |
| Pedidos (admin) | Lista, actualiza estado, asigna repartidor | `services/admin/order.service.ts` |
| Cocina | Lista pedidos en preparación, confirma | `services/admin/kitchen.service.ts` |
| Mozo | Lista mesas activas, pedidos por mesa | — |
| Configuración | GET/PUT tenant config | `services/admin/settings.service.ts` |
| Dashboard | Métricas generales del tenant | `services/admin/tenant-dashboard.service.ts` |

### Módulo Cliente — Pedidos Públicos

| Módulo | Rutas | Archivo de servicio |
|--------|-------|---------------------|
| Menú público | `GET /menu/:slug` | `services/client/tenant.service.ts` |
| Crear pedido | `POST /orders/:slug` | — |
| Seguimiento | `GET /orders/:trackingCode/track` | — |

---

## Módulo Almacén (Warehouse)

Prefijo base: `POST /api/admin/warehouse/...`

### Catálogo / Maestros

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/families` | Listar familias |
| POST | `/families` | Crear familia |
| PUT | `/families/:id` | Actualizar familia |
| GET | `/subfamilies` | Listar subfamilias (`?familyId=`) |
| POST | `/subfamilies` | Crear subfamilia |
| PUT | `/subfamilies/:id` | Actualizar subfamilia |
| GET | `/areas` | Listar áreas de almacén |
| POST | `/areas` | Crear área |
| PUT | `/areas/:id` | Actualizar área |
| GET | `/suppliers` | Listar proveedores (`?search=`) |
| GET | `/suppliers/:id` | Obtener proveedor por ID |
| POST | `/suppliers` | Crear proveedor |
| PUT | `/suppliers/:id` | Actualizar proveedor |
| GET | `/items` | Listar artículos (`?search=`, `?subfamilyId=`, `?isActive=`) |
| GET | `/items/:id` | Obtener artículo con asignaciones |
| POST | `/items` | Crear artículo |
| PUT | `/items/:id` | Actualizar artículo |
| GET | `/areas/:areaId/items` | Artículos asignados a un área |
| POST | `/items/:itemId/areas` | Asignar artículo a área |
| DELETE | `/items/:itemId/areas/:areaId` | Quitar artículo de área |

### Flujo 1 — Documentos de Compra

Tablas: `purchase_documents`, `purchase_document_lines`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/purchase-documents` | Listar (`?status=`, `?supplierId=`) |
| GET | `/purchase-documents/:id` | Obtener con líneas |
| POST | `/purchase-documents` | Crear en borrador |
| PUT | `/purchase-documents/:id` | Actualizar borrador (reemplaza líneas) |
| POST | `/purchase-documents/:id/process` | Procesar → actualiza stock y kardex |
| POST | `/purchase-documents/:id/void` | Anular borrador |

Al **procesar**: aplica entrada de stock, crea lote (`batches`) e historial de precio de compra.

### Flujo 2 — Requerimientos Internos

Tablas: `requisitions`, `requisition_lines`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/requisitions` | Listar (`?status=`, `?areaId=`) |
| GET | `/requisitions/:id` | Obtener con líneas |
| POST | `/requisitions` | Crear en borrador |
| POST | `/requisitions/:id/process` | Procesar → mueve stock central → área |
| POST | `/requisitions/:id/void` | Anular borrador |

Al **procesar**: sale del almacén central y entra en el área solicitante (doble movimiento en kardex).

### Flujo 3 — Transferencias de Stock

Tablas: `stock_transfers`, `stock_transfer_lines`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/stock-transfers` | Listar (`?status=`) |
| GET | `/stock-transfers/:id` | Obtener con líneas |
| POST | `/stock-transfers` | Crear en borrador |
| POST | `/stock-transfers/:id/process` | Procesar → mueve stock entre áreas |
| POST | `/stock-transfers/:id/void` | Anular borrador |

### Flujo 4 — Salidas de Stock

Tablas: `stock_exits`, `stock_exit_lines`

Tipos de salida: `consumption`, `write_off`, `quality_control`, `kitchen_test`, `invoice_transfer`, `fruit_cleaning`, `expense`, `customer_return`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/stock-exits` | Listar (`?status=`, `?areaId=`) |
| GET | `/stock-exits/:id` | Obtener con líneas |
| POST | `/stock-exits` | Crear en borrador |
| POST | `/stock-exits/:id/process` | Procesar → descuenta stock del área |
| POST | `/stock-exits/:id/void` | Anular borrador |

### Flujo 5 — Porcionamientos

Tablas: `portionings`, `portioning_lines`, `waste_log`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/portionings` | Listar (`?status=`, `?areaId=`) |
| GET | `/portionings/:id` | Obtener con líneas |
| POST | `/portionings` | Crear en borrador |
| POST | `/portionings/:id/process` | Procesar → consume fuente, crea porciones, registra merma |
| POST | `/portionings/:id/void` | Anular borrador |

Al **procesar**: sale el artículo fuente, entran los artículos porcionados, se registra merma en `waste_log`.

### Flujo 6 — Ajuste de Inventarios

Tablas: `inventory_adjustments`, `adjustment_lines`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/inventory-adjustments` | Listar (`?status=`, `?areaId=`) |
| GET | `/inventory-adjustments/:id` | Obtener con líneas |
| POST | `/inventory-adjustments/open` | Abrir ajuste (carga snapshot actual) |
| PATCH | `/inventory-adjustments/:id/lines` | Actualizar cantidades contadas |
| POST | `/inventory-adjustments/:id/close` | Cerrar → aplica diferencias al kardex |

### Flujo 7 — Recetas

Tablas: `recipes`, `recipe_lines`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/recipes` | Listar (`?productId=`) |
| GET | `/recipes/:id` | Obtener receta con líneas |
| GET | `/products/:productId/recipe` | Receta del producto |
| POST | `/recipes` | Crear receta con líneas |

### Flujo 8 — Descarga de Venta

Tablas: `sales_discharge`, `sales_discharge_lines`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/sales-discharge/preview/:orderId` | Previsualizar descarga sin guardar |
| POST | `/sales-discharge` | Crear descarga para un pedido |
| POST | `/sales-discharge/:id/process` | Procesar → descuenta insumos por receta |

### Flujo 9 — Lotes (Batches)

Tabla: `batches`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/batches` | Listar (`?areaId=`, `?itemId=`, `?status=`, `?expiringOnly=true`) |
| POST | `/batches/refresh-statuses` | Actualizar estados por fecha de vencimiento |

### Reportes y Kardex

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/kardex/area/:areaId` | Movimientos del kardex (`?itemId=`, `?limit=`) |
| GET | `/stock-snapshot` | Stock actual por área (`?areaId=`) |
| GET | `/waste-log` | Registro de mermas (`?areaId=`, `?from=`, `?to=`) |

### Configuración del Almacén

Tabla: `system_settings`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/settings` | Listar todas las configuraciones |
| PUT | `/settings/:key` | Crear o actualizar una configuración |

---

## Seguridad y Aislamiento

- Cada request tiene su propio contexto AsyncLocalStorage
- Las BDs están separadas a nivel de servidor PostgreSQL — no hay forma de "escapar" a otra BD
- El middleware valida que el tenant exista antes de cualquier operación
- Errores de contexto: `400` falta tenantId, `404` tenant no existe, `500` sin servidor configurado
- Auditoría completa en tabla `audit_log` con before/after data en todas las operaciones

---

## Identificación de Tenant

### Rutas Admin (requieren tenantId)

```javascript
// Query parameter
GET /api/admin/categories?tenantId=1

// Header
GET /api/admin/categories
X-Tenant-ID: 1
```

### Rutas Cliente (usan slug)

```javascript
GET /api/client/menu/pizzeria-downtown
GET /api/client/tables/pizzeria-downtown
```

---

## Archivos Clave

| Archivo | Descripción |
|---------|-------------|
| `src/db/tenant/schema.ts` | Esquema completo de la BD del tenant |
| `src/utils/tenant-context.ts` | Contexto global AsyncLocalStorage |
| `src/core/tenant/middleware/tenant-context.middleware.ts` | Middleware de identificación |
| `src/core/tenant/services/admin/` | Servicios del módulo restaurante |
| `src/core/tenant/services/warehouse/` | Servicios del módulo almacén |
| `src/core/tenant/controllers/warehouse/catalog.controller.ts` | Controlador catálogo |
| `src/core/tenant/controllers/warehouse/movements.controller.ts` | Controlador movimientos |
| `src/core/tenant/controllers/warehouse/recipes-ledger.controller.ts` | Controlador recetas/kardex |
| `src/core/tenant/routes/admin/warehouse/index.ts` | Rutas del almacén |
| `src/core/tenant/validations/warehouse/warehouse.validation.ts` | Validaciones Zod |

---

**Fecha de Implementación:** 2026-05-22
**Status:** ✅ COMPLETADO

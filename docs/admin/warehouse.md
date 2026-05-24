# Módulo Almacén (Warehouse)

API multi-tenant para inventarios, kardex, recetas y descarga de venta.

**Base path:** `/api/admin/warehouse`  
**Auth:** `Authorization: Bearer <accessToken>`  
**Tenant:** `?tenantId=<id>` o header `X-Tenant-ID`  
**Rol requerido:** `admin`

Ver también: [`gastropro360_flujos.md`](../../gastropro360_flujos.md) (flujos en español) e [`IMPLEMENTATION_SUMMARY.md`](../../IMPLEMENTATION_SUMMARY.md) (contexto multi-tenant).

---

## Maestros (catálogo)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/families` | Familias de artículos |
| POST | `/families` | Crear familia |
| GET | `/subfamilies?familyId=` | Subfamilias |
| POST | `/subfamilies` | Crear subfamilia |
| GET | `/areas` | Áreas de almacén |
| POST | `/areas` | Crear área (`isCentral: true` para almacén central) |
| GET | `/suppliers?search=` | Proveedores |
| POST | `/suppliers` | Crear proveedor |
| GET | `/items?search=&subfamilyId=` | Maestro de artículos |
| POST | `/items` | Crear artículo (asigna área central por defecto) |
| GET | `/items/:id` | Detalle con asignaciones por área |
| GET | `/areas/:areaId/items?search=` | Artículos asignados al área |
| POST | `/items/:itemId/areas` | Body: `{ "areaId": number }` |

---

## Flujo 1 — Documentos de compra

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/purchase-documents?status=&supplierId=` | Listado |
| GET | `/purchase-documents/:id` | Cabecera + líneas |
| POST | `/purchase-documents` | Crear en `draft` |
| POST | `/purchase-documents/:id/process` | GENERADO → PROCESADO (kardex + PP + lotes) |
| POST | `/purchase-documents/:id/void` | Anular solo si `draft` |

**Ejemplo body POST:**

```json
{
  "documentType": "invoice",
  "series": "F001",
  "sequential": "000123",
  "supplierId": 1,
  "issueDate": "2026-05-20",
  "areaId": 1,
  "lines": [
    {
      "itemId": 10,
      "qty": "5",
      "unitPrice": "12.50",
      "lineTotal": "62.50",
      "taxPct": "18",
      "taxAmount": "11.25"
    }
  ]
}
```

---

## Flujo 2 — Requerimientos

| POST | `/requisitions` | Crear (`draft`) |
| POST | `/requisitions/:id/process` | Despacha del central al subalmacén |

---

## Flujo 3 — Transferencias

| POST | `/stock-transfers` | Crear |
| POST | `/stock-transfers/:id/process` | Mueve entre áreas asignadas |

---

## Flujo 4 — Salidas

| POST | `/stock-exits` | Crear baja/consumo/etc. |
| POST | `/stock-exits/:id/process` | Aplica salida en kardex del área |

---

## Flujo 5 — Porcionamiento

| POST | `/portionings` | Origen + líneas derivadas |
| POST | `/portionings/:id/process` | Merma + `waste_log` |

---

## Flujo 6 — Ajuste de inventario

| POST | `/inventory-adjustments/open` | Abre ajuste (`open`), precarga stock |
| PATCH | `/inventory-adjustments/:id/lines` | Body: `{ "lines": [{ "id", "finalStock" }] }` |
| POST | `/inventory-adjustments/:id/close` | Cierra y aplica diferencias |

---

## Flujos 8–10 — Recetas, descarga, lotes

| GET | `/recipes?productId=` | Listado |
| GET | `/recipes/:id` | Detalle + análisis de costo |
| GET | `/products/:productId/recipe` | Receta activa del plato |
| POST | `/recipes` | Crear receta + ingredientes |
| GET | `/sales-discharge/preview/:orderId` | Simula consumo por receta |
| POST | `/sales-discharge` | `{ "orderId", "areaId" }` |
| POST | `/sales-discharge/:id/process` | Descuenta stock |
| GET | `/batches?expiringOnly=true` | Lotes por vencer |
| POST | `/batches/refresh-statuses` | Job de estados de vencimiento |

**Descarga automática:** al actualizar un pedido a `completed` (`PATCH /api/admin/orders/:id/status`), el backend intenta crear y procesar la descarga si hay recetas configuradas.

---

## Consultas

| GET | `/kardex/area/:areaId?itemId=&limit=` | Kardex central o por área |
| GET | `/stock-snapshot?areaId=` | Pivot stock por área |
| GET | `/waste-log?areaId=&from=&to=` | Reporte de mermas |
| GET | `/settings` | Parámetros del sistema |
| PUT | `/settings/:key` | Body: `{ "value": "18" }` |

Claves por defecto (`system_settings`): `igv_percentage`, `default_currency`, `costing_method`, `active_period`, `stock_alert_days` (equivalentes ES: `igv_porcentaje`, `moneda_defecto`, etc. en el manual).

---

## Respuesta estándar

```json
{
  "success": true,
  "data": { },
  "message": "opcional"
}
```

Errores: `{ "success": false, "message": "..." }` con HTTP 400/404/500.

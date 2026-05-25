# GastroPro 360 — Flujo de Facturación, Boleta y Nota de Venta

**Módulo:** Documentos de Venta  
**Versión:** v1 (sin integración SUNAT)  
**Depende de:** `gastropro360_flujos.md` (warehouse), pedidos (`orders`)

---

## Índice

1. [Resumen del cambio al flujo de stock](#1-resumen-del-cambio-al-flujo-de-stock)
2. [Flujo 11 — Ciclo de Pedido (nueva lógica de stock)](#2-flujo-11--ciclo-de-pedido-nueva-lógica-de-stock)
3. [Flujo 12 — Edición de Pedido Abierto](#3-flujo-12--edición-de-pedido-abierto)
4. [Flujo 13 — Generación de Documento de Venta](#4-flujo-13--generación-de-documento-de-venta)
5. [Tipos de documento y sus diferencias](#5-tipos-de-documento-y-sus-diferencias)
6. [Series y numeración correlativa](#6-series-y-numeración-correlativa)
7. [Cálculo de montos e IGV](#7-cálculo-de-montos-e-igv)
8. [Estados y ciclo de vida del documento](#8-estados-y-ciclo-de-vida-del-documento)
9. [Schema — nuevas tablas](#9-schema--nuevas-tablas)
10. [Endpoints REST](#10-endpoints-rest)
11. [Reglas de negocio](#11-reglas-de-negocio)
12. [Tablas afectadas por flujo](#12-tablas-afectadas-por-flujo)
13. [Diagrama de estados completo](#13-diagrama-de-estados-completo)

---

## 1. Resumen del cambio al flujo de stock

### Antes (flujo anterior)
```
POST /waiter/orders  →  order creada (stock: sin cambio)
        ...
PATCH /orders/:id/status → completed  →  autoDischargeOnOrderCompleted() → stock descontado
```

### Ahora (nuevo comportamiento)
```
POST /waiter/orders  →  order creada  →  descarga de stock INMEDIATA
   (stock descontado en el mismo request, igual que hoy en completed)

El documento de facturación (factura/boleta/NV) es completamente INDEPENDIENTE
del descuento de stock. El stock ya bajó al crear el pedido.
```

### Impacto en `sales_discharge`
- La descarga se crea y procesa al **crear el pedido** (no al completarlo)
- Si el pedido se edita → se ajustan las líneas de descarga y el stock
- Si el pedido se cancela → se revierte la descarga y el stock se repone
- El campo `orders.status` ya NO dispara descarga automática (se elimina ese hook)

---

## 2. Flujo 11 — Ciclo de Pedido (nueva lógica de stock)

### Creación del pedido

```
1. POST /waiter/orders
   Body: { customerName, deliveryType, items: [...], paymentMethod, ... }

2. VALIDACIONES
   ├─ Productos existen y están activos
   ├─ Precios y cantidades son válidos
   └─ tableId válido si deliveryType = 'dine_in'

3. TRANSACCIÓN
   ├─ INSERT orders (status: 'pending', paymentStatus: 'unpaid')
   ├─ INSERT order_items[] (una fila por producto)
   └─ Calcular totales: subtotal, packagingFee, deliveryFee, total

4. DESCUENTO DE STOCK INMEDIATO (post-transacción, no crítico)
   ├─ Para cada order_item con productId:
   │   └─ Buscar receta activa del producto (recipes WHERE productId AND isActive)
   │       ├─ [Sin receta] → skip (no descarga para este item)
   │       └─ [Con receta] → calcular ingredientes:
   │           cantidad = (receta_linea.qty / recipe.servings)
   │                      × order_item.quantity
   │                      / (recipe.yieldPct / 100)
   │           [si isCost=TRUE] → convertir con conversionFactor
   ├─ Crear sales_discharge (status: 'processed', orderId)
   ├─ Crear sales_discharge_lines[]
   └─ applyStockExit() por cada ingrediente con recipeDischarge=TRUE
       (si falla: warning en log, el pedido YA se creó — stock failure no bloquea al mozo)

5. RESPUESTA
   └─ { success: true, data: { order, stockWarnings?: [...] } }
```

### Estados válidos del pedido

| Estado | Permite editar items | Permite generar doc | Stock |
|--------|:--------------------:|:-------------------:|-------|
| `pending` | ✅ Sí | ✅ Sí | ya descontado |
| `confirmed` | ✅ Sí | ✅ Sí | ya descontado |
| `preparing` | ✅ Sí (con cautela) | ✅ Sí | ya descontado |
| `dispatched` | ❌ No | ✅ Sí | ya descontado |
| `ready_for_pickup` | ❌ No | ✅ Sí | ya descontado |
| `completed` | ❌ No | ✅ Sí | ya descontado |
| `cancelled` | ❌ No | ❌ No | **repuesto** |

---

## 3. Flujo 12 — Edición de Pedido Abierto

**Condición:** el pedido debe estar en `pending`, `confirmed` o `preparing`.

### Endpoint: `PATCH /waiter/orders/:id/items`

```json
{
  "action": "add" | "remove" | "update_qty",
  "orderItemId": 12,        // para remove / update_qty
  "productId": 5,           // para add
  "quantity": 2,            // para add / update_qty
  "selectedAlternatives": [],
  "notes": "sin cebolla"
}
```

### Caso: AGREGAR item

```
1. Validar que order.status IN ('pending', 'confirmed', 'preparing')
2. Verificar que el producto existe y está activo
3. INSERT order_items (nuevo item)
4. Recalcular totales del pedido (UPDATE orders.total)
5. Descuento de stock del NUEVO item:
   ├─ Buscar receta del producto
   ├─ Calcular ingredientes para la cantidad agregada
   ├─ applyStockExit() por cada ingrediente
   └─ INSERT nuevas sales_discharge_lines a la descarga existente del pedido
       (o crear nueva descarga si el primer intento de descarga había fallado)
```

### Caso: ELIMINAR item

```
1. Validar estado del pedido
2. Obtener order_item a eliminar
3. Revertir stock del item eliminado:
   ├─ Buscar las sales_discharge_lines del item a eliminar
   ├─ applyStockEntry() por cada ingrediente (reverso exacto)
   └─ DELETE sales_discharge_lines correspondientes
4. DELETE order_items (el item)
5. Recalcular totales del pedido
```

### Caso: MODIFICAR CANTIDAD

```
1. Validar estado del pedido
2. Obtener order_item actual (qty_anterior)
3. Calcular diferencia: delta = qty_nueva - qty_anterior
4. Si delta > 0 → descontar stock para la diferencia positiva (applyStockExit)
5. Si delta < 0 → reponer stock para la diferencia negativa (applyStockEntry)
6. Actualizar sales_discharge_lines con la nueva qty total
7. UPDATE order_items.quantity, totalPrice
8. Recalcular totales del pedido
```

### Caso: CANCELAR PEDIDO

```
1. Validar que el pedido NO esté en completed / cancelled
2. Revertir TODO el stock consumido:
   ├─ Obtener sales_discharge del pedido (si existe y status = 'processed')
   ├─ Por cada sales_discharge_line → applyStockEntry() (reverso)
   └─ UPDATE sales_discharge.status = 'voided'
3. UPDATE orders.status = 'cancelled'
4. Si el pedido tenía un documento de facturación en status = 'draft':
   └─ UPDATE billing_documents.status = 'voided' automáticamente
```

---

## 4. Flujo 13 — Generación de Documento de Venta

### Pre-requisitos

> 1. El pedido debe existir y NO estar `cancelled`.
> 2. No debe existir ya un documento NO anulado para ese pedido (1 pedido → 1 doc activo).
> 3. El tenant debe tener al menos una serie configurada para el tipo solicitado.

### Pasos

```
1. INICIO
   └─ Mozo o admin selecciona un pedido y hace clic en "Generar Documento"

2. SELECCIÓN DE TIPO
   ├─ Factura    → requiere RUC del comprador (11 dígitos)
   ├─ Boleta     → requiere DNI (8 dígitos) — o "00000000" para consumidor final
   └─ Nota de Venta → solo datos internos, sin obligación fiscal

3. INGRESO DE DATOS DEL COMPRADOR (según tipo)
   ├─ Factura:
   │   ├─ tipoDocumento: 'RUC'
   │   ├─ numeroDocumento: '20123456789' (11 dígitos)
   │   ├─ razonSocial: 'EMPRESA SAC'
   │   └─ direccionFiscal: (opcional)
   ├─ Boleta:
   │   ├─ tipoDocumento: 'DNI' | 'CE' | null (consumidor final)
   │   ├─ numeroDocumento: '12345678'
   │   └─ nombreCompleto: 'Juan Pérez'
   └─ Nota de Venta:
       └─ descripcion: (opcional)

4. POST /admin/billing/documents
   Body: {
     orderId,
     documentType: 'factura' | 'boleta' | 'nota_de_venta',
     seriesId,            // qué serie usar (ej: F001)
     buyerDocType?,       // 'RUC' | 'DNI' | 'CE' | null
     buyerDocNumber?,
     buyerName?,
     buyerAddress?,
     notes?
   }

5. SISTEMA GENERA EL DOCUMENTO
   ├─ Obtiene el siguiente correlativo de la serie (LOCK para concurrencia)
   ├─ Construye número de documento: series + '-' + correlativo.padStart(6, '0')
   │   Ejemplo: 'F001-000042'
   ├─ Copia las líneas desde order_items:
   │   ├─ productName, quantity, unitPrice, selectedAlternatives
   │   └─ Calcula: lineSubtotal, lineTaxAmount, lineTotal según taxOperation
   ├─ Calcula totales:
   │   ├─ subtotal = SUM(lineSubtotal)
   │   ├─ taxAmount = SUM(lineTaxAmount)   [18% IGV por defecto]
   │   └─ total = subtotal + taxAmount
   ├─ INSERT billing_documents (status: 'issued')
   ├─ INSERT billing_document_lines[]
   └─ UPDATE billing_series.lastSequential += 1

6. RESPUESTA
   └─ { success: true, data: { document, lines } }

7. ACCIONES POST-GENERACIÓN
   ├─ Ver/imprimir en PDF (GET /admin/billing/documents/:id/pdf — futura fase)
   ├─ Anular si fue error → POST /admin/billing/documents/:id/void
   └─ El stock NO se modifica (ya fue descontado al crear el pedido)
```

---

## 5. Tipos de documento y sus diferencias

| Característica | Factura | Boleta | Nota de Venta |
|----------------|---------|--------|---------------|
| Naturaleza | Comprobante fiscal oficial | Comprobante fiscal oficial | Documento interno |
| Destinatario | Empresas (con RUC) | Personas naturales | Cualquiera |
| Datos requeridos | RUC (11 dígitos) + Razón social | DNI/CE (opcional) | Ninguno |
| Incluye IGV | ✅ (desglosado) | ✅ (incluido en precio) | Opcional |
| Válido para deducir IGV | ✅ Comprador | ❌ | ❌ |
| Serie formato | `F001`, `F002`... | `B001`, `B002`... | `NV01`, `NV02`... |
| SUNAT (v2) | Obligatorio registrar | Obligatorio ≥ S/700 | No aplica |
| Código tipo `documentType` | `'factura'` | `'boleta'` | `'nota_de_venta'` |

### Modelo de precio con IGV

Para **factura**: el precio de venta se considera **sin IGV** (precio neto).
```
subtotal      = SUM(unitPrice × quantity)                  (sin IGV)
taxAmount     = subtotal × 0.18                            (IGV 18%)
total         = subtotal + taxAmount
```

Para **boleta y nota de venta**: el precio de venta se considera **con IGV incluido**.
```
total         = SUM(unitPrice × quantity)                  (precio con IGV)
subtotal      = total / 1.18                               (base imponible)
taxAmount     = total - subtotal                           (IGV implícito)
```

> ⚠ El tipo de precio (con/sin IGV) puede configurarse por serie. El modelo por defecto para boleta es "precio con IGV incluido" siguiendo la práctica peruana de restaurantes.

---

## 6. Series y numeración correlativa

### Estructura de una serie

```
billing_series {
  id,
  documentType:    'factura' | 'boleta' | 'nota_de_venta',
  series:          'F001',   // código de la serie
  lastSequential:  42,       // último correlativo emitido
  priceInclTax:    false,    // TRUE = precios ya incluyen IGV
  taxRate:         18,       // tasa IGV %
  isActive:        true,
  description:     'Factura electrónica local'
}
```

### Reglas de numeración

- El correlativo es por serie, no global.
- Se obtiene con un `SELECT ... FOR UPDATE` (o SKIP LOCKED) para evitar duplicados.
- El número completo de documento = `series + '-' + correlativo.padStart(6, '0')`.
- Ejemplo: serie `F001`, correlativo `42` → `F001-000042`.
- El correlativo nunca se reutiliza aunque el documento sea anulado.

### Series por defecto al crear tenant

El sistema puede auto-crear estas series al aprovisionar un tenant nuevo:

| Tipo | Serie | Descripción |
|------|-------|-------------|
| `factura` | `F001` | Factura estándar |
| `boleta` | `B001` | Boleta de venta |
| `nota_de_venta` | `NV01` | Nota de venta interna |

---

## 7. Cálculo de montos e IGV

### Input: líneas del pedido

```
order_items:
  productName: 'Lomo Saltado'
  unitPrice:   '35.00'    (almacenado como string decimal en orders)
  quantity:    2
  totalPrice:  '70.00'
  packagingFee: '0.00'
  selectedAlternatives: []
```

### Algoritmo de cálculo (por línea)

```
// Precio de la alternativa seleccionada
alternativesExtra = SUM(selectedAlternatives[].extraPrice × quantity)

// Precio bruto de la línea (antes de IGV)
grossLineTotal = (unitPrice × quantity) + alternativesExtra + (packagingFee × quantity)

SI priceInclTax = FALSE  (factura, precio neto):
  lineSubtotal   = grossLineTotal
  lineTaxAmount  = ROUND(lineSubtotal × (taxRate / 100), 2)
  lineTotal      = lineSubtotal + lineTaxAmount

SI priceInclTax = TRUE  (boleta/NV, precio con IGV incluido):
  lineTotal      = grossLineTotal
  lineSubtotal   = ROUND(lineTotal / (1 + taxRate / 100), 2)
  lineTaxAmount  = lineTotal - lineSubtotal
```

### Totales del documento

```
subtotal      = SUM(lineSubtotal)
taxAmount     = SUM(lineTaxAmount)
total         = SUM(lineTotal)       (debe igualar subtotal + taxAmount)

// Ajuste por redondeo (≤ ±0.01)
roundingAdj   = total - (subtotal + taxAmount)
```

---

## 8. Estados y ciclo de vida del documento

| Estado | Descripción | Puede anularse |
|--------|-------------|:--------------:|
| `draft` | Guardado pero no emitido (uso futuro, para revisión) | ✅ Sí (sin nro asignado aún) |
| `issued` | Emitido y numerado | ✅ Sí (genera una anulación) |
| `voided` | Anulado | ❌ No (estado final) |

> **v1 simplificada:** se emite directamente (`issued`) al crear el documento. El estado `draft` queda reservado para fases futuras con pre-aprobación.

### Anulación

```
POST /admin/billing/documents/:id/void
Body: { reason: 'Error en datos del cliente' }

Reglas:
  - Solo se pueden anular documentos en status 'issued'
  - El correlativo NO se reutiliza
  - El stock NO se modifica (la anulación del doc es fiscal, no de inventario)
  - Si el pedido también debe cancelarse → hacerlo por separado
  - UPDATE billing_documents.status = 'voided', voidedAt, voidedReason
```

---

## 9. Schema — nuevas tablas

### `billing_series` — series configuradas por tenant

```typescript
export const billingSeries = pgTable('billing_series', {
  id: serial('id').primaryKey(),
  documentType: varchar('document_type', { length: 20,
    enum: ['factura', 'boleta', 'nota_de_venta'] as const }).notNull(),
  series: varchar('series', { length: 10 }).notNull().unique(),  // 'F001', 'B001', 'NV01'
  lastSequential: integer('last_sequential').notNull().default(0),
  priceInclTax: boolean('price_incl_tax').notNull().default(false), // true = precio con IGV
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).notNull().default('18'),
  isActive: boolean('is_active').notNull().default(true),
  description: varchar('description', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

### `billing_documents` — cabecera del documento

```typescript
export const billingDocuments = pgTable('billing_documents', {
  id: serial('id').primaryKey(),
  orderId: varchar('order_id', { length: 12 }).notNull().references(() => orders.id),
  seriesId: integer('series_id').notNull().references(() => billingSeries.id),
  documentType: varchar('document_type', { length: 20,
    enum: ['factura', 'boleta', 'nota_de_venta'] as const }).notNull(),
  series: varchar('series', { length: 10 }).notNull(),     // desnormalizado p/ rapidez
  sequential: integer('sequential').notNull(),
  documentNumber: varchar('document_number', { length: 20 }).notNull().unique(), // 'F001-000042'

  // Datos del comprador
  buyerDocType: varchar('buyer_doc_type', { length: 10, // 'RUC','DNI','CE', null
    enum: ['RUC', 'DNI', 'CE'] as const }),
  buyerDocNumber: varchar('buyer_doc_number', { length: 20 }),
  buyerName: varchar('buyer_name', { length: 200 }),
  buyerAddress: text('buyer_address'),
  buyerEmail: varchar('buyer_email', { length: 150 }),

  // Montos
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).notNull(),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull(),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('PEN'),

  // Estado
  status: varchar('status', { length: 20,
    enum: ['draft', 'issued', 'voided'] as const }).notNull().default('issued'),
  notes: text('notes'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedReason: text('voided_reason'),
  createdBy: varchar('created_by', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orderIdx: index('billing_docs_order_idx').on(table.orderId),
  statusIdx: index('billing_docs_status_idx').on(table.status),
  typeIdx: index('billing_docs_type_idx').on(table.documentType),
  issuedAtIdx: index('billing_docs_issued_at_idx').on(table.issuedAt),
}));
```

### `billing_document_lines` — líneas del documento

```typescript
export const billingDocumentLines = pgTable('billing_document_lines', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id').notNull()
    .references(() => billingDocuments.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id),
  productName: varchar('product_name', { length: 150 }).notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  // extras/alternativas incluidas en el precio
  alternativesDesc: varchar('alternatives_desc', { length: 300 }),
  packagingFee: decimal('packaging_fee', { precision: 10, scale: 2 }).notNull().default('0'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),   // base imponible línea
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull(), // IGV línea
  lineTotal: decimal('line_total', { precision: 12, scale: 2 }).notNull(), // total línea
  notes: varchar('notes', { length: 200 }),
}, (table) => ({
  docIdx: index('billing_doc_lines_doc_idx').on(table.documentId),
}));
```

### Relaciones Drizzle

```typescript
export const billingSeriesRelations = relations(billingSeries, ({ many }) => ({
  documents: many(billingDocuments),
}));

export const billingDocumentsRelations = relations(billingDocuments, ({ one, many }) => ({
  order: one(orders, { fields: [billingDocuments.orderId], references: [orders.id] }),
  series: one(billingSeries, { fields: [billingDocuments.seriesId], references: [billingSeries.id] }),
  lines: many(billingDocumentLines),
}));

export const billingDocumentLinesRelations = relations(billingDocumentLines, ({ one }) => ({
  document: one(billingDocuments, { fields: [billingDocumentLines.documentId], references: [billingDocuments.id] }),
  product: one(products, { fields: [billingDocumentLines.productId], references: [products.id] }),
}));
```

### Cambio en `orders` — columna extra recomendada

```typescript
// Agregar a la tabla orders (opcional pero útil):
billingDocumentId: integer('billing_document_id')
  .references(() => billingDocuments.id, { onDelete: 'set null' }),
// → permite saber de forma instantánea si un pedido ya tiene documento
```

---

## 10. Endpoints REST

**Base:** `/api/admin/billing/...`  
**Auth:** Bearer JWT + rol `admin`

### Documentos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/billing/documents` | Listar documentos (paginado, filtros) |
| `GET` | `/billing/documents/:id` | Detalle completo con líneas |
| `GET` | `/billing/preview/:orderId` | Preview del documento antes de emitirlo |
| `POST` | `/billing/documents` | Crear y emitir documento |
| `POST` | `/billing/documents/:id/void` | Anular documento |

### Series

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/billing/series` | Listar series del tenant |
| `POST` | `/billing/series` | Crear nueva serie |
| `PUT` | `/billing/series/:id` | Actualizar serie (nombre, estado) |

### Filtros de listado (`GET /billing/documents`)

```
?page=1&limit=20
&documentType=factura|boleta|nota_de_venta
&status=issued|voided
&orderId=xyz123
&startDate=2025-01-01
&endDate=2025-12-31
&buyerDoc=20123456789    (busca en buyerDocNumber)
&search=texto            (busca en documentNumber, buyerName)
```

### Pedidos — nuevos endpoints de edición

| Método | Ruta | Descripción |
|--------|------|-------------|
| `PATCH` | `/waiter/orders/:id/items` | Agregar/eliminar/modificar item |
| `POST` | `/waiter/orders/:id/cancel` | Cancelar pedido (repone stock) |

### Body `POST /billing/documents`

```json
{
  "orderId": "ABC123",
  "documentType": "factura",
  "seriesId": 1,
  "buyerDocType": "RUC",
  "buyerDocNumber": "20123456789",
  "buyerName": "EMPRESA DEMO SAC",
  "buyerAddress": "Av. Lima 123, Lima",
  "buyerEmail": "compras@empresa.com",
  "notes": "Orden de compra OC-001"
}
```

### Body `PATCH /waiter/orders/:id/items`

```json
// Agregar item
{
  "action": "add",
  "productId": 5,
  "quantity": 2,
  "unitPrice": "35.00",
  "productName": "Lomo Saltado",
  "selectedAlternatives": [],
  "packagingFee": "0.00",
  "notes": "sin cebolla",
  "totalPrice": "70.00"
}

// Eliminar item
{
  "action": "remove",
  "orderItemId": 12
}

// Cambiar cantidad
{
  "action": "update_qty",
  "orderItemId": 12,
  "quantity": 3
}
```

---

## 11. Reglas de negocio

### Sobre el stock
1. El stock se descuenta al **crear** el pedido, no al generar el documento fiscal.
2. Editar un pedido (add/remove/update_qty) **ajusta el stock en tiempo real**.
3. Cancelar el pedido **revierte** todo el stock descontado.
4. Emitir o anular un documento fiscal **no afecta el stock**.

### Sobre los documentos
5. Un pedido puede tener **máximo 1 documento activo** (no anulado) a la vez.
6. Si el documento activo es anulado, se puede emitir uno nuevo para el mismo pedido.
7. El correlativo es **irrecuperable** aunque el documento sea anulado.
8. Un documento anulado **no puede** modificarse, solo registra la razón de anulación.
9. Los documentos no pueden editarse una vez emitidos (solo anular y re-emitir).

### Sobre la factura
10. Para factura: el `buyerDocNumber` debe ser RUC (11 dígitos). Validar formato.
11. Para boleta: si `buyerDocType = null` (consumidor final), usar `'00000000'` como número estándar.

### Sobre el IGV
12. La tasa de IGV por defecto es 18% (Perú). Configurable por serie.
13. Para notas de venta internas, se puede configurar la serie con `taxRate = 0`.
14. El campo `orders.total` incluye IGV (precios del menú son con IGV incluido). El documento descompone el IGV implícito.

### Sobre las series
15. Al menos una serie activa por tipo de documento para poder emitir ese tipo.
16. El `lastSequential` solo crece, nunca decrece.
17. La serie se bloquea con `SELECT ... FOR UPDATE` al asignar correlativo para evitar duplicados en concurrent requests.

---

## 12. Tablas afectadas por flujo

| Flujo | Tablas escritas | Tablas leídas |
|-------|----------------|---------------|
| Crear pedido | `orders`, `orderItems`, `salesDischarge`, `salesDischargeLines`, `areaLedger`, `stockSnapshot`, `batches` | `products`, `recipes`, `recipeLines`, `items` |
| Editar pedido (add) | `orderItems`, `salesDischargeLines`, `areaLedger`, `stockSnapshot`, `batches` | `orders`, `products`, `recipes`, `recipeLines`, `items` |
| Editar pedido (remove) | `orderItems`, `salesDischargeLines`, `areaLedger`, `stockSnapshot`, `batches` | `orders`, `items` |
| Cancelar pedido | `orders`, `salesDischarge`, `areaLedger`, `stockSnapshot`, `batches` | `salesDischargeLines`, `items` |
| Crear documento | `billingDocuments`, `billingDocumentLines`, `billingSeries` | `orders`, `orderItems` |
| Anular documento | `billingDocuments` | — |

---

## 13. Diagrama de estados completo

### Pedido (`orders.status`)

```
                    [editable: add/remove/update_qty]
                    ─────────────────────────────────
     POST /orders       │        │        │
         │           pending ──► confirmed ──► preparing
         ▼              │                       │
    stock descontado    │                       │
    doc: opcional       │                   dispatched ──► ready_for_pickup
                        │                       │              │
                        └───────────────────────┴──────────────┤
                                                               ▼
                                                          completed ◄─ (entregado)
                                                               │
                                                         (no editable)
                        ┌──────────── cancelled ◄──────────────┘
                        │    (stock repuesto, doc anulado si draft)
                        ▼
                   [estado final]
```

### Documento (`billing_documents.status`)

```
     POST /billing/documents
              │
              ▼
           issued  ──► (imprimir / ver PDF)
              │
    POST .../void
              │
              ▼
           voided
           (stock sin cambio)
              │
    [se puede emitir nuevo doc para el mismo pedido]
```

### Relación Pedido ↔ Documento de Venta

```
orders (1) ────────────── (0..1) billing_documents
    │                               │
    └── orderItems (N)              └── billingDocumentLines (N)
    │                                     [copiado de orderItems al crear]
    └── salesDischarge (0..1)
          └── salesDischargeLines (N)
                [registro del descuento de stock]
```

---

## Apéndice — Checklist de implementación

### Backend `api-mikuywasi`

- [ ] Agregar tablas `billing_series`, `billing_documents`, `billing_document_lines` al schema Drizzle
- [ ] Agregar relaciones en `schema.ts`
- [ ] `drizzle-kit generate` + migraciones tenant
- [ ] **Mover** `autoDischargeOnOrderCompleted` → `autoDischargeOnOrderCreated` en `order.service.ts` (waiter)
- [ ] Eliminar el hook de descarga en `updateOrderStatus('completed')`
- [ ] Nuevo endpoint `PATCH /waiter/orders/:id/items` con lógica de stock delta
- [ ] Nuevo endpoint `POST /waiter/orders/:id/cancel` con reversión de stock
- [ ] Servicio `billing.service.ts`:
  - [ ] `listBillingDocuments(filters)`
  - [ ] `getBillingDocument(id)`
  - [ ] `previewBillingDocument(orderId, seriesId, priceInclTax)`
  - [ ] `createBillingDocument(data)` — con bloqueo de serie para correlativo
  - [ ] `voidBillingDocument(id, reason)`
- [ ] Servicio `billing-series.service.ts`:
  - [ ] `listSeries()`
  - [ ] `createSeries(data)`
  - [ ] `updateSeries(id, data)`
  - [ ] `getNextSequential(seriesId)` — con SELECT FOR UPDATE
- [ ] Controladores y rutas bajo `/admin/billing/`
- [ ] Validaciones Zod para todos los endpoints
- [ ] Registrar en `audit_log` las operaciones de emisión y anulación

### Base de datos

- [ ] Seed inicial de series (`F001`, `B001`, `NV01`) en `seedTenantData()`

### Frontend `admin-mikuywasi` (fase posterior)

- [ ] Botón "Generar Documento" en vista de pedido
- [ ] Modal selector de tipo (factura/boleta/NV) + formulario de datos comprador
- [ ] Lista de documentos con filtros
- [ ] Vista de detalle del documento (tabla de líneas + totales)
- [ ] Botón anular con confirmación + campo razón
- [ ] Módulo de configuración de series

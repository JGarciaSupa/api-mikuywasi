# 🏪 Análisis: Sucursales y Almacenes

> **Contexto**: El sistema actualmente funciona como un único local (single-branch).
> Este documento analiza qué tablas y lógica deben modificarse para soportar
> **múltiples sucursales** y una **jerarquía de almacenes** dentro de ellas.

---

## 📐 Nueva Jerarquía de Entidades

```
Tenant (restaurante)
 └── Sucursal (branch)           ← NUEVA TABLA
      ├── Configuración propia   ← Extraída de tenant_configs
      ├── Mesas QR               ← restaurant_tables + branchId
      ├── Caja                   ← cash_sessions + branchId
      ├── Pedidos                ← orders + branchId
      ├── Facturación            ← billing_series/documents + branchId
      └── Almacén (warehouse)    ← NUEVA TABLA (nivel lógico)
           └── Área de almacén   ← storage_areas + warehouseId
                └── Ítem         ← stock, kardex, etc.
```

### Diferencia entre Almacén y Área

| Concepto | Descripción | Ejemplo |
|---|---|---|
| **Almacén** (`warehouses`) | Instalación física de almacenaje. Puede ser central o de una sucursal | "Almacén Central", "Almacén Sucursal Miraflores" |
| **Área** (`storage_areas`) | Zona dentro del almacén por tipo de conservación | "Cámara Fría", "Ambiente", "Congelado" |

---

## 🆕 Tablas Nuevas a Crear

### 1. `branches` — Sucursales

Esta tabla reemplaza y extiende la data de ubicación/canales que hoy vive en `tenant_configs`.
`tenant_configs` queda como **configuración global** (logo, colores, marca).

```ts
export const branches = pgTable('branches', {
  id:            serial('id').primaryKey(),
  name:          varchar('name', { length: 100 }).notNull(),        // "Sede Miraflores"
  code:          varchar('code', { length: 20 }).notNull().unique(), // "MFL-01"
  isMain:        boolean('is_main').default(false).notNull(),        // sucursal principal

  // Ubicación y canales propios de esta sede
  address:       jsonb('address').$type<{ fullAddress: string; lat: number; lng: number }>(),
  deliveryZone:  jsonb('delivery_zone').$type<{ type: 'Polygon'; coordinates: number[][][] } | null>(),
  schedules:     jsonb('schedules').$type<{ day: string; startTime: string; endTime: string; closed: boolean }[]>().default([]),

  phone:         varchar('phone', { length: 30 }),
  whatsapp:      varchar('whatsapp', { length: 30 }),
  email:         varchar('email', { length: 150 }),

  hasDelivery:   boolean('has_delivery').default(false).notNull(),
  hasPickup:     boolean('has_pickup').default(false).notNull(),
  hasDineIn:     boolean('has_dine_in').default(false).notNull(),
  hasLiveTracking: boolean('has_live_tracking').default(false).notNull(),

  minOrderAmount:       decimal('min_order_amount', { precision: 10, scale: 2 }).default('0.00'),
  defaultDeliveryFee:   decimal('default_delivery_fee', { precision: 10, scale: 2 }).default('0.00'),
  freeDeliveryThreshold: decimal('free_delivery_threshold', { precision: 10, scale: 2 }),

  // Datos fiscales propios (si tributan por separado)
  fiscalId:   varchar('fiscal_id', { length: 30 }),
  fiscalName: varchar('fiscal_name', { length: 200 }),

  isActive:   boolean('is_active').default(true).notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

---

### 2. `warehouses` — Almacenes

Nivel intermedio entre sucursal y área de almacenamiento.
Un almacén puede ser **central** (sin sucursal asignada, sirve a todas) o **propio de una sucursal**.

```ts
export const warehouses = pgTable('warehouses', {
  id:         serial('id').primaryKey(),
  name:       varchar('name', { length: 100 }).notNull(),
  code:       varchar('code', { length: 20 }).notNull().unique(),  // "ALM-CENTRAL"
  branchId:   integer('branch_id').references(() => branches.id),  // null = almacén central
  isCentral:  boolean('is_central').default(false).notNull(),       // true = abastece a todas las sedes
  description: varchar('description', { length: 255 }),
  isActive:   boolean('is_active').default(true).notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

---

### 3. `user_branches` — Asignación de usuarios a sucursales

Un usuario puede operar en **una o varias** sucursales.
Reemplaza la FK directa; el JWT llevará el `branchId` de la sesión activa.

```ts
export const userBranches = pgTable('user_branches', {
  id:         serial('id').primaryKey(),
  userId:     integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  branchId:   integer('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
  isDefault:  boolean('is_default').default(false).notNull(), // sucursal de inicio de sesión por defecto
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  unique: uniqueIndex('user_branches_unique_idx').on(table.userId, table.branchId),
}));
```

---

## ✏️ Tablas Existentes a Modificar

### 🏢 `core.ts`

| Tabla | Campo a agregar | Observación |
|---|---|---|
| `tenant_configs` | — | Queda como config **global** de marca. Eliminar campos de dirección, schedules, delivery, hasDelivery, etc. (se mueven a `branches`) |
| `restaurant_tables` | `branchId integer NOT NULL` | Cada mesa pertenece a una sucursal |
| `orders` | `branchId integer NOT NULL` | Todo pedido se origina en una sucursal |
| `users` | — | Sin cambio directo; la asignación va en `user_branches` |
| `payment_methods` | `branchId integer` nullable | `null` = método global disponible en todas las sedes; con valor = exclusivo de esa sede |
| `banners` | `branchId integer` nullable | `null` = banner global; con valor = sólo esa sede |
| `social_links` | `branchId integer` nullable | Ídem |

> **Catálogo de productos/categorías**: `categories` y `products` se mantienen **globales**.
> Si una sucursal necesita un precio diferente en el futuro, se puede añadir una tabla
> `branch_product_overrides` (precio especial por sede), pero **no es necesario en la primera iteración**.

---

### 🏬 `warehouse.ts`

#### Jerarquía de almacenamiento

| Tabla | Campo a agregar | Observación |
|---|---|---|
| `storage_areas` | `warehouseId integer NOT NULL` | El área pertenece a un almacén específico |

> Con esta adición la cadena queda: `warehouse → storage_area → item`
> La query de stock siempre filtra por `storage_area.warehouseId` y `warehouse.branchId`.

#### Documentos de movimiento

| Tabla | Campo a agregar | Observación |
|---|---|---|
| `purchase_documents` | `branchId integer NOT NULL` | Qué sede realiza la compra |
| `requisitions` | `branchId integer NOT NULL` | Qué sede solicita los insumos |
| `stock_transfers` | `branchId integer` nullable | Puede ser una transferencia **entre sucursales** (`sourceBranchId / targetBranchId`) — ver nota |
| `stock_exits` | `branchId integer NOT NULL` | Desde qué sede sale el stock |
| `portionings` | `branchId integer NOT NULL` | En qué sede se hace el porcionado |
| `inventory_adjustments` | `branchId integer NOT NULL` | Ajuste de qué sede |
| `sales_discharge` | `branchId integer NOT NULL` | Ya vinculada al `order`, que tendrá `branchId` |
| `batches` | — | Hereda la sucursal a través del `storage_area → warehouse → branch` |

> **Nota sobre `stock_transfers` cross-branch**: Si la transferencia es entre almacenes de
> distintas sucursales (ej: el almacén central abastece a Miraflores), conviene añadir
> `sourceBranchId` y `targetBranchId` directamente para facilitar los reportes, en lugar
> de hacer JOINs de 3 niveles.

#### Kardex y snapshots

| Tabla | Campo a agregar | Observación |
|---|---|---|
| `main_ledger` | `branchId integer NOT NULL`, `warehouseId integer NOT NULL` | Filtrar kardex por sede y almacén |
| `area_ledger` | `branchId integer NOT NULL` | Heredado del área, pero denormalizado para performance |
| `stock_snapshot` | `branchId integer NOT NULL` | Snapshot siempre por sede |
| `purchase_price_history` | `branchId integer NOT NULL` | A qué sede corresponde el precio |
| `waste_log` | `branchId integer NOT NULL` | Métricas de merma por sede |

#### Caja

| Tabla | Campo a agregar | Observación |
|---|---|---|
| `cash_sessions` | `branchId integer NOT NULL` | La caja es **por sucursal** |
| `cash_movements` | — | Hereda por `sessionId → cashSession.branchId` |

---

### 🧾 `billing.ts`

| Tabla | Campo a agregar | Observación |
|---|---|---|
| `billing_series` | `branchId integer NOT NULL` | Cada sucursal tiene su propia serie (B001 Miraflores, B001 SJM, etc.) |
| `billing_documents` | `branchId integer NOT NULL` | El documento fiscal se emite desde una sede |

---

### 🛡️ `rbac.ts`

| Tabla | Campo a agregar | Observación |
|---|---|---|
| `user_roles` | `branchId integer` nullable | Permite que un usuario tenga distintos roles en distintas sucursales. `null` = rol global (admin central) |
| `user_permission_overrides` | `branchId integer` nullable | Sobrescritos aplicables sólo en una sede específica |

---

## ⚙️ Cambios de Lógica y Contexto de Sesión

### JWT / Contexto de sucursal activa

El token de acceso debe incluir el `branchId` de la sucursal en la que el usuario
inició sesión. Si el usuario tiene acceso a múltiples sucursales, debe poder
**cambiar de sucursal** sin cerrar sesión (renovando el token con el nuevo `branchId`).

```
JWT payload actual:  { userId, role }
JWT payload nuevo:   { userId, role, branchId, warehouseIds[] }
```

---

### Filtrado automático por sucursal (Row-Level Scope)

Todas las consultas del backend deben recibir `branchId` del contexto de la sesión
y aplicarlo como filtro. Recomendado: un middleware que inyecte `req.branchId`
desde el JWT y un helper de Drizzle que lo reciba.

```ts
// Ejemplo de helper
export function withBranch(branchId: number) {
  return {
    orders:        eq(orders.branchId, branchId),
    cashSessions:  eq(cashSessions.branchId, branchId),
    // ...etc
  };
}
```

---

### Transferencias entre Almacenes y Sucursales

Escenarios que deben manejarse:

| Tipo | Descripción |
|---|---|
| **Intra-almacén** | Del área A al área B dentro del mismo almacén |
| **Inter-almacén (misma sucursal)** | Del Almacén 1 al Almacén 2 de la misma sede |
| **Inter-sucursal** | Del almacén central → almacén de sucursal Miraflores |

Para los tres casos se usa `stock_transfers`, pero los campos `sourceAreaId / targetAreaId`
ya permiten inferir el almacén y la sucursal mediante JOIN. Si se agrega `sourceBranchId / targetBranchId`
denormalizado en `stock_transfers`, los reportes de movimientos cross-branch son triviales.

---

### Reportes consolidados vs. por sucursal

- **Por sucursal**: filtrar todo por `branchId`.
- **Consolidado (admin global)**: agrupar por `branchId` y sumar.
- El rol `admin` sin `branchId` en el JWT = **acceso consolidado a todas las sedes**.

---

## 📋 Resumen de Cambios por Archivo

### `core.ts`
- ✏️ `tenant_configs` → eliminar campos de ubicación/canales → moverlos a `branches`
- ✏️ `restaurant_tables` → `+ branchId`
- ✏️ `orders` → `+ branchId`
- ✏️ `payment_methods` → `+ branchId` (nullable)
- ✏️ `banners` → `+ branchId` (nullable)
- ✏️ `social_links` → `+ branchId` (nullable)
- 🆕 `branches`
- 🆕 `user_branches`

### `warehouse.ts`
- 🆕 `warehouses`
- ✏️ `storage_areas` → `+ warehouseId`
- ✏️ `purchase_documents` → `+ branchId`
- ✏️ `requisitions` → `+ branchId`
- ✏️ `stock_transfers` → `+ sourceBranchId`, `+ targetBranchId`
- ✏️ `stock_exits` → `+ branchId`
- ✏️ `portionings` → `+ branchId`
- ✏️ `inventory_adjustments` → `+ branchId`
- ✏️ `main_ledger` → `+ branchId`, `+ warehouseId`
- ✏️ `area_ledger` → `+ branchId`
- ✏️ `stock_snapshot` → `+ branchId`
- ✏️ `purchase_price_history` → `+ branchId`
- ✏️ `waste_log` → `+ branchId`
- ✏️ `cash_sessions` → `+ branchId`

### `billing.ts`
- ✏️ `billing_series` → `+ branchId`
- ✏️ `billing_documents` → `+ branchId`

### `rbac.ts`
- ✏️ `user_roles` → `+ branchId` (nullable)
- ✏️ `user_permission_overrides` → `+ branchId` (nullable)

---

## ⚠️ Consideraciones Importantes

1. **Catálogo global de productos**: `categories` y `products` no llevan `branchId`.
   El catálogo es compartido. Si en el futuro se necesitan precios distintos por sede,
   se crea `branch_product_prices` como tabla de overrides.

2. **Migración de datos existentes**: Al aplicar estos cambios, los registros actuales
   deben asignarse a la sucursal principal (`isMain = true`). Crear primero la sucursal
   principal y luego hacer `UPDATE table SET branch_id = 1`.

3. **`tenant_configs` no desaparece**: Sigue existiendo para datos globales de marca
   (logo, colores, categoría del restaurante). Los datos de ubicación/canales/fiscales
   se mueven a `branches`.

4. **Almacén central**: Un almacén con `branchId = null` e `isCentral = true` puede
   abastecer a todas las sucursales vía `stock_transfers`. Las áreas de ese almacén
   tendrán stock propio en el Kardex.

5. **Índices**: Todos los nuevos campos `branchId` deben tener índice, ya que serán
   el filtro más frecuente en todas las queries operativas.

# 🍳 Análisis: Flujo Receta → Venta → Descuento de Almacén

> **Objetivo**: Cuando se realiza una venta (order), el sistema debe descontar
> automáticamente los insumos del almacén usando la receta asignada al producto vendido.
> Este documento describe cómo funciona actualmente, qué falta y cómo adaptarlo
> al contexto de **sucursales y almacenes**.

---

## ✅ Lo que ya existe en el schema

La base ya está construida. Las tablas involucradas son:

```
products          → menú del restaurante
  └── recipes     → receta asignada al producto (1 activa por producto)
       └── recipe_lines  → ingredientes: qué item, qué cantidad, qué unidad

orders            → pedido de un cliente
  └── order_items → productos pedidos (con cantidad)

sales_discharge         → cabecera del descuento generado por la venta
  └── sales_discharge_lines → detalle: qué item, cuánto se descontó, a qué precio
```

---

## 🔄 Flujo Completo: De la Venta al Descuento

```
1. Cliente hace un pedido (order)
        ↓
2. Pedido cambia a estado 'confirmed' o 'preparing'
        ↓
3. Sistema busca los order_items del pedido
        ↓
4. Por cada order_item → busca la receta activa del producto
        ↓
5. Por cada recipe_line → calcula cantidad total = recipe_line.qty × order_item.quantity
        ↓
6. Agrupa todos los ingredientes necesarios (suma si hay varios platos con el mismo insumo)
        ↓
7. Crea un registro en sales_discharge (cabecera) vinculado al order
        ↓
8. Crea los sales_discharge_lines (uno por ingrediente)
        ↓
9. Descuenta el stock:
   - Actualiza items.currentStock  (campo desnormalizado)
   - Actualiza stock_snapshot (por área)
   - Inserta en main_ledger y area_ledger (kardex)
        ↓
10. sales_discharge.status = 'processed'
```

---

## 🎯 ¿En qué momento se dispara el descuento?

El momento del trigger es una decisión de negocio. Las opciones son:

| Trigger | Estado del pedido | Pros | Contras |
|---|---|---|---|
| **Al confirmar** | `confirmed` | Stock descontado apenas se acepta el pedido | Se descuenta aunque la cocina no haya empezado |
| **Al preparar** ✅ | `preparing` | Refleja exactamente cuándo la cocina usa los insumos | Pequeño delay entre confirmación y descuento |
| **Al completar** | `completed` | Solo descuenta lo que realmente se entregó | Mucho delay, stock no refleja lo comprometido |

> **Recomendación**: disparar en `preparing`. Es el estándar en sistemas de restaurante
> porque la cocina empieza a usar los insumos exactamente en ese momento.

---

## 🏗️ Lo que FALTA o necesita ajustarse

### Problema 1: ¿De qué área/almacén se descuenta?

Actualmente `sales_discharge` tiene un `areaId` fijo. El problema es:
**¿cómo sabe el sistema de qué área descontar para cada sucursal?**

**Solución — campo `productionAreaId` en la receta:**

La tabla `recipes` ya tiene `productionAreaId` (el área donde se produce ese plato).
Con el nuevo modelo de warehouses, esa área pertenece a un almacén que a su vez
pertenece a una sucursal.

**Flujo de resolución del área de descuento:**

```
order.branchId
    → buscar warehouse de la sucursal (tipo producción)
        → buscar storage_area dentro de ese warehouse
            → usar ese areaId para el sales_discharge
```

O más simple: la `recipe.productionAreaId` ya apunta directamente al área.
El sistema valida que esa área pertenezca al warehouse de la sucursal del pedido.

---

### Problema 2: Un producto puede NO tener receta

No todos los productos del menú tienen receta (ej: una bebida envasada que se
controla por unidades pero no tiene ingredientes). El sistema debe manejar esto:

```
Si el producto tiene receta activa → genera descuento automático
Si NO tiene receta                 → no genera descuento (se ignora)
```

El campo `items.recipeDischarge` (ya existe) indica si el item se descarga por receta.

---

### Problema 3: Agregar `branchId` y `warehouseId` a `sales_discharge`

Para reportes y filtros por sucursal, `sales_discharge` necesita:

```ts
// Agregar a sales_discharge:
branchId:    integer('branch_id').notNull().references(() => branches.id),
warehouseId: integer('warehouse_id').references(() => warehouses.id),
```

---

### Problema 4: La receta es global, el área de producción es por sucursal

Con múltiples sucursales, la receta del "Pollo a la Brasa" es la misma en todas
las sedes, pero el **área donde se produce** puede variar por sucursal.

**Dos opciones de diseño:**

#### Opción A (Simple) — `productionAreaId` en la receta apunta al área de cada sucursal
> El admin configura una receta diferente por sucursal (misma receta, distinto `productionAreaId`).
> Simple pero genera duplicación de recetas.

#### Opción B (Recomendada) — `branch_recipe_areas` como tabla de mapeo
> La receta es única y global. Por sucursal se configura en qué área se produce.

```ts
export const branchRecipeAreas = pgTable('branch_recipe_areas', {
  id:        serial('id').primaryKey(),
  branchId:  integer('branch_id').notNull().references(() => branches.id),
  productId: integer('product_id').notNull().references(() => products.id),
  areaId:    integer('area_id').notNull().references(() => storageAreas.id),
}, (table) => ({
  unique: uniqueIndex('branch_recipe_areas_unique_idx').on(table.branchId, table.productId),
}));
```

Con esta tabla, al hacer una venta en la Sucursal X, el sistema busca:
`branchRecipeAreas WHERE branchId = X AND productId = Y → areaId`

---

## 📐 Schema Final del Flujo (con Sucursales y Almacenes)

### Tablas involucradas y sus relaciones

```
branches (sucursales)
  └── warehouses (almacenes)
       └── storage_areas (áreas)

products (catálogo global)
  └── recipes (receta global por producto)
       └── recipe_lines (ingredientes: item + qty + unidad)

branch_recipe_areas  ← NUEVA
  (branchId + productId → areaId donde se produce en esa sucursal)

orders (+ branchId)
  └── order_items (+ productId + quantity)
       ↓ trigger al pasar a 'preparing'
sales_discharge (+ branchId + warehouseId)
  └── sales_discharge_lines
       → descuenta stock de items
       → actualiza stock_snapshot por area
       → inserta en main_ledger y area_ledger
```

---

## 🔢 Ejemplo Numérico

**Pedido en Sucursal Miraflores:**
- 2× Pollo a la Brasa (productId: 5)
- 1× Arroz con Leche (productId: 12)

**Receta "Pollo a la Brasa" (`recipe_lines`):**
| Ingrediente | Qty por porción | Unidad |
|---|---|---|
| Pollo entero | 0.900 | kg |
| Ajo molido | 0.020 | kg |
| Sillao | 0.015 | lt |

**Cálculo del descuento (×2 unidades vendidas):**
| Ingrediente | Qty a descontar |
|---|---|
| Pollo entero | 1.800 kg |
| Ajo molido | 0.040 kg |
| Sillao | 0.030 lt |

**`sales_discharge_lines` generadas:**
```
itemId: pollo_id,    qty: 1.800, avgPrice: 12.50, lineCost: 22.500
itemId: ajo_id,      qty: 0.040, avgPrice:  8.00, lineCost:  0.320
itemId: sillao_id,   qty: 0.030, avgPrice:  6.50, lineCost:  0.195
```

**`sales_discharge.totalCost`** = 23.015 (costo total de insumos usados en esta venta)

---

## 🔁 Lógica de Reversión (si el pedido se cancela)

Si un pedido pasa a `cancelled` después de haber sido `preparing`:

```
1. Buscar el sales_discharge vinculado al order
2. Si status = 'processed' → crear reversión:
   - sales_discharge.status = 'voided'
   - Reinsertar el stock (entrada en kardex con signo positivo)
   - Actualizar stock_snapshot (sumar de vuelta)
   - Actualizar items.currentStock
```

---

## 📋 Resumen: Cambios Necesarios

### Tablas a crear
| Tabla | Propósito |
|---|---|
| `branch_recipe_areas` | Mapear qué área de producción usa cada sucursal para cada producto |

### Tablas a modificar
| Tabla | Campo a agregar |
|---|---|
| `sales_discharge` | `branchId integer NOT NULL` |
| `sales_discharge` | `warehouseId integer` (nullable, para reportes) |
| `recipes` | Evaluar si `productionAreaId` se mantiene como default global o se reemplaza por `branch_recipe_areas` |

### Lógica de servicio a implementar
| Servicio | Descripción |
|---|---|
| `SalesDischargeService.processOrder(orderId)` | Calcula ingredientes, crea `sales_discharge` y descuenta stock |
| `SalesDischargeService.voidDischarge(orderId)` | Revierte el descuento si el pedido se cancela |
| `OrderService` (en el cambio de estado) | Llama a `processOrder` cuando el status cambia a `preparing` |

### Trigger en el cambio de estado del pedido

```ts
// En el servicio que actualiza el estado del pedido
async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  await db.update(orders).set({ status: newStatus }).where(eq(orders.id, orderId));

  if (newStatus === 'preparing') {
    await salesDischargeService.processOrder(orderId);  // ← disparo del descuento
  }

  if (newStatus === 'cancelled') {
    await salesDischargeService.voidDischarge(orderId); // ← reversión si aplica
  }
}
```

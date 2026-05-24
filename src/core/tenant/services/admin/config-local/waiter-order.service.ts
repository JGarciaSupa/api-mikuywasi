import { eq, and, sql } from 'drizzle-orm';
import {
  orders,
  orderItems,
  products,
  salesDischarge,
  salesDischargeLines,
  recipes,
  recipeLines,
  items,
} from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { toNum, roundMoney, roundQty } from './../warehouse/shared/numbers';
import { applyStockExit, applyStockEntry } from './../warehouse/shared/stock-movement.service';
import { reverseDischargeForOrder } from './../warehouse/sales-discharge.service';

const EDITABLE_STATUSES = ['pending', 'confirmed', 'preparing'] as const;
type EditableStatus = (typeof EDITABLE_STATUSES)[number];

function assertEditable(status: string, orderId: string) {
  if (!(EDITABLE_STATUSES as readonly string[]).includes(status)) {
    throw new Error(
      `No se puede editar el pedido ${orderId} en estado '${status}'. ` +
      `Solo se puede editar en: ${EDITABLE_STATUSES.join(', ')}.`
    );
  }
}

// ── Helpers de receta/stock ────────────────────────────────────────────────────

interface IngredientLine {
  itemId: number;
  recipeId: number;
  qty: number;
  unit: string;
  avgPrice: number;
  lineCost: number;
  productionAreaId: number;
}

async function calcIngredientsForProduct(
  db: ReturnType<typeof getTenantDb>,
  productId: number,
  quantity: number
): Promise<IngredientLine[]> {
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.productId, productId), eq(recipes.isActive, true)))
    .limit(1);

  if (!recipe?.productionAreaId) return [];

  const lines = await db.select().from(recipeLines).where(eq(recipeLines.recipeId, recipe.id));
  const result: IngredientLine[] = [];

  const servings = toNum(recipe.servings) || 1;
  const yieldFactor = (toNum(recipe.yieldPct) || 100) / 100;

  for (const rl of lines) {
    if (rl.isOptional) continue;
    const [item] = await db.select().from(items).where(eq(items.id, rl.itemId));
    if (!item?.recipeDischarge) continue;

    let qty = (toNum(rl.qty) / servings) * quantity / yieldFactor;
    if (rl.isCost && toNum(item.conversionFactor) > 0) {
      qty = qty / toNum(item.conversionFactor);
    }
    qty = roundQty(qty);
    const avgPrice = toNum(item.avgPrice);

    result.push({
      itemId: rl.itemId,
      recipeId: recipe.id,
      qty,
      unit: rl.unit,
      avgPrice,
      lineCost: roundMoney(qty * avgPrice),
      productionAreaId: recipe.productionAreaId,
    });
  }

  return result;
}

async function recalcOrderTotals(
  db: ReturnType<typeof getTenantDb>,
  orderId: string
) {
  const ois = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const subtotal = ois.reduce((s, i) => s + toNum(i.totalPrice), 0);
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  const deliveryFee = toNum((order as any)?.deliveryFee ?? '0');
  const total = roundMoney(subtotal + deliveryFee);

  await db
    .update(orders)
    .set({ subtotal: String(roundMoney(subtotal)), total: String(total), updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

// ── Edit order item ────────────────────────────────────────────────────────────

export type EditAction = 'add' | 'remove' | 'update_qty';

export interface EditOrderItemInput {
  action: EditAction;
  orderItemId?: number;
  productId?: number;
  quantity?: number;
  selectedAlternatives?: { name: string; extraPrice: number }[];
  notes?: string;
}

export async function editOrderItem(orderId: string, input: EditOrderItemInput) {
  const db = getTenantDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Pedido ${orderId} no encontrado`);
  assertEditable(order.status, orderId);

  const [existingDischarge] = await db
    .select()
    .from(salesDischarge)
    .where(eq(salesDischarge.orderId, orderId));

  switch (input.action) {
    case 'add': {
      if (!input.productId || !input.quantity || input.quantity <= 0) {
        throw new Error('Para agregar un item se requiere productId y quantity > 0');
      }
      const [product] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, input.productId), eq(products.isActive, true)));
      if (!product) throw new Error('Producto no encontrado o inactivo');

      const alternativesExtra = (input.selectedAlternatives ?? [])
        .reduce((s: number, a: any) => s + toNum(a.extraPrice) * input.quantity!, 0);
      const unitPrice = toNum(product.price);
      const totalPrice = roundMoney(unitPrice * input.quantity! + alternativesExtra);

      const [newItem] = await db
        .insert(orderItems)
        .values({
          orderId,
          productId: product.id,
          productName: product.name,
          unitPrice: String(unitPrice),
          quantity: input.quantity,
          selectedAlternatives: input.selectedAlternatives ?? [],
          packagingFee: '0',
          notes: input.notes ?? null,
          totalPrice: String(totalPrice),
        })
        .returning();

      await recalcOrderTotals(db, orderId);

      const ingredients = await calcIngredientsForProduct(db, product.id, input.quantity);
      if (ingredients.length) {
        const dischargeId = existingDischarge?.id;
        if (dischargeId && existingDischarge?.status === 'processed') {
          const newCost = roundMoney(
            toNum(existingDischarge.totalCost) +
            ingredients.reduce((s, l) => s + l.lineCost, 0)
          );
          await db
            .insert(salesDischargeLines)
            .values(
              ingredients.map((l) => ({
                dischargeId,
                itemId: l.itemId,
                recipeId: l.recipeId,
                qty: String(l.qty),
                unit: l.unit,
                avgPrice: String(l.avgPrice),
                lineCost: String(l.lineCost),
              }))
            );
          await db
            .update(salesDischarge)
            .set({ totalCost: String(newCost) })
            .where(eq(salesDischarge.id, dischargeId));

          for (const l of ingredients) {
            await applyStockExit({
              itemId: l.itemId,
              areaId: existingDischarge.areaId,
              qty: l.qty,
              unitPrice: l.avgPrice,
              documentType: 'descarga_venta',
              documentNumber: `DV-${orderId}`,
              originDest: `Pedido ${orderId} — item agregado`,
            });
          }
        }
      }

      return newItem;
    }

    case 'remove': {
      if (!input.orderItemId) throw new Error('Para eliminar se requiere orderItemId');
      const [oi] = await db.select().from(orderItems).where(eq(orderItems.id, input.orderItemId));
      if (!oi || oi.orderId !== orderId) throw new Error('Item no encontrado en el pedido');

      if (
        oi.productId &&
        existingDischarge?.status === 'processed'
      ) {
        const dischLines = await db
          .select()
          .from(salesDischargeLines)
          .where(
            and(
              eq(salesDischargeLines.dischargeId, existingDischarge.id),
              eq(salesDischargeLines.itemId, oi.productId as any)
            )
          );

        const ingredients = await calcIngredientsForProduct(db, oi.productId, oi.quantity);
        for (const l of ingredients) {
          await applyStockEntry({
            itemId: l.itemId,
            areaId: existingDischarge.areaId,
            qty: l.qty,
            unitPrice: l.avgPrice,
            documentType: 'reverso_descarga',
            documentNumber: `DV-VOID-${orderId}`,
            originDest: `Pedido ${orderId} — item eliminado`,
          });
        }

        const itemIds = ingredients.map((l) => l.itemId);
        if (itemIds.length) {
          for (const id of itemIds) {
            const matching = dischLines.filter((dl) => dl.itemId === id);
            for (const dl of matching) {
              await db.delete(salesDischargeLines).where(eq(salesDischargeLines.id, dl.id));
            }
          }
        }
      }

      await db.delete(orderItems).where(eq(orderItems.id, input.orderItemId));
      await recalcOrderTotals(db, orderId);
      return { removed: input.orderItemId };
    }

    case 'update_qty': {
      if (!input.orderItemId || !input.quantity || input.quantity <= 0) {
        throw new Error('Para modificar cantidad se requiere orderItemId y quantity > 0');
      }
      const [oi] = await db.select().from(orderItems).where(eq(orderItems.id, input.orderItemId));
      if (!oi || oi.orderId !== orderId) throw new Error('Item no encontrado en el pedido');

      const prevQty = oi.quantity;
      const delta = input.quantity - prevQty;
      const unitPrice = toNum(oi.unitPrice);
      const newTotalPrice = roundMoney(unitPrice * input.quantity);

      const [updatedItem] = await db
        .update(orderItems)
        .set({ quantity: input.quantity, totalPrice: String(newTotalPrice) })
        .where(eq(orderItems.id, input.orderItemId))
        .returning();

      await recalcOrderTotals(db, orderId);

      if (oi.productId && existingDischarge?.status === 'processed' && delta !== 0) {
        const absDelta = Math.abs(delta);
        const ingredients = await calcIngredientsForProduct(db, oi.productId, absDelta);

        for (const l of ingredients) {
          if (delta > 0) {
            await applyStockExit({
              itemId: l.itemId,
              areaId: existingDischarge.areaId,
              qty: l.qty,
              unitPrice: l.avgPrice,
              documentType: 'descarga_venta',
              documentNumber: `DV-${orderId}`,
              originDest: `Pedido ${orderId} — qty+${delta}`,
            });
          } else {
            await applyStockEntry({
              itemId: l.itemId,
              areaId: existingDischarge.areaId,
              qty: l.qty,
              unitPrice: l.avgPrice,
              documentType: 'reverso_descarga',
              documentNumber: `DV-ADJ-${orderId}`,
              originDest: `Pedido ${orderId} — qty${delta}`,
            });
          }
        }

        const allLines = await db
          .select()
          .from(salesDischargeLines)
          .where(eq(salesDischargeLines.dischargeId, existingDischarge.id));

        for (const l of ingredients) {
          const existing = allLines.find((dl) => dl.itemId === l.itemId && dl.recipeId === l.recipeId);
          if (existing) {
            const prevQtyLine = toNum(existing.qty);
            const newQtyLine = roundQty(delta > 0 ? prevQtyLine + l.qty : Math.max(0, prevQtyLine - l.qty));
            const newCostLine = roundMoney(newQtyLine * toNum(existing.avgPrice));
            await db
              .update(salesDischargeLines)
              .set({ qty: String(newQtyLine), lineCost: String(newCostLine) })
              .where(eq(salesDischargeLines.id, existing.id));
          }
        }
      }

      return updatedItem;
    }

    default:
      throw new Error('Acción no válida. Use: add | remove | update_qty');
  }
}

// ── Cancel order ───────────────────────────────────────────────────────────────

export async function cancelOrder(orderId: string) {
  const db = getTenantDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Pedido ${orderId} no encontrado`);

  if (order.status === 'cancelled') throw new Error('El pedido ya está cancelado');
  if (order.status === 'completed') throw new Error('No se puede cancelar un pedido completado');

  await reverseDischargeForOrder(orderId);

  const [updated] = await db
    .update(orders)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  return updated;
}

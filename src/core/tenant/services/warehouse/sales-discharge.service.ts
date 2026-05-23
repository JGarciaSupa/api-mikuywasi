import { eq, and } from 'drizzle-orm';
import {
  salesDischarge,
  salesDischargeLines,
  orders,
  orderItems,
  recipes,
  recipeLines,
  items,
  products,
} from '../../../../db/tenant/schema';
import { getTenantDb } from '../../../../utils/tenant-context';
import { toNum, roundMoney, roundQty } from './shared/numbers';
import { writeAuditLog } from './shared/audit.service';
import { applyStockExit } from './shared/stock-movement.service';
import type { AuditActor } from './types';

async function getDischargeWithLines(id: number) {
  const db = getTenantDb();
  const [doc] = await db.select().from(salesDischarge).where(eq(salesDischarge.id, id));
  if (!doc) return null;
  const lines = await db.select().from(salesDischargeLines).where(eq(salesDischargeLines.dischargeId, id));
  return { ...doc, lines };
}

export async function getSalesDischargeByOrderId(orderId: string) {
  const db = getTenantDb();
  const [doc] = await db.select().from(salesDischarge).where(eq(salesDischarge.orderId, orderId));
  if (!doc) return null;
  return getDischargeWithLines(doc.id);
}

/** Calcula líneas de descarga a partir de un pedido completado */
export async function buildDischargeFromOrder(orderId: string) {
  const db = getTenantDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (order.status !== 'completed') {
    throw new Error('El pedido debe estar en estado completed para generar descarga');
  }

  const oItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const calculated: {
    itemId: number;
    recipeId: number;
    qty: number;
    unit: string;
    avgPrice: number;
    lineCost: number;
    productionAreaId: number;
  }[] = [];

  for (const oi of oItems) {
    if (!oi.productId) continue;

    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.productId, oi.productId), eq(recipes.isActive, true)))
      .limit(1);

    if (!recipe?.productionAreaId) continue;

    const lines = await db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeId, recipe.id));

    const orderQty = toNum(oi.quantity);
    const servings = toNum(recipe.servings) || 1;
    const yieldFactor = (toNum(recipe.yieldPct) || 100) / 100;

    for (const rl of lines) {
      if (rl.isOptional) continue;

      const [item] = await db.select().from(items).where(eq(items.id, rl.itemId));
      if (!item?.recipeDischarge) continue;

      let ingredientQty = (toNum(rl.qty) / servings) * orderQty / yieldFactor;

      if (rl.isCost && toNum(item.conversionFactor) > 0) {
        ingredientQty = ingredientQty / toNum(item.conversionFactor);
      }

      ingredientQty = roundQty(ingredientQty);
      const avgPrice = toNum(item.avgPrice);
      const lineCost = roundMoney(ingredientQty * avgPrice);

      calculated.push({
        itemId: rl.itemId,
        recipeId: recipe.id,
        qty: ingredientQty,
        unit: rl.unit,
        avgPrice,
        lineCost,
        productionAreaId: recipe.productionAreaId,
      });
    }
  }

  return { order, lines: calculated };
}

export async function createSalesDischargeFromOrder(orderId: string, areaId: number, actor?: AuditActor) {
  const db = getTenantDb();
  const existing = await getSalesDischargeByOrderId(orderId);
  if (existing) throw new Error('Ya existe una descarga para este pedido');

  const { order, lines } = await buildDischargeFromOrder(orderId);
  if (!lines.length) throw new Error('No hay ingredientes con receta para descargar');

  const totalCost = roundMoney(lines.reduce((s, l) => s + l.lineCost, 0));

  return db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(salesDischarge)
      .values({
        orderId,
        areaId,
        status: 'draft',
        totalCost: String(totalCost),
        createdBy: actor?.userName,
      })
      .returning();

    await tx.insert(salesDischargeLines).values(
      lines.map((l) => ({
        dischargeId: doc.id,
        itemId: l.itemId,
        recipeId: l.recipeId,
        qty: String(l.qty),
        unit: l.unit,
        avgPrice: String(l.avgPrice),
        lineCost: String(l.lineCost),
      }))
    );

    return getDischargeWithLines(doc.id);
  });
}

export async function processSalesDischarge(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const doc = await getDischargeWithLines(id);
  if (!doc) throw new Error('Descarga no encontrada');
  if (doc.status !== 'draft') throw new Error('La descarga ya fue procesada');

  const docNumber = `DV-${doc.orderId}`;

  return db.transaction(async (tx) => {
    for (const line of doc.lines) {
      const qty = toNum(line.qty);
      if (qty <= 0) continue;

      await applyStockExit(
        {
          itemId: line.itemId,
          areaId: doc.areaId,
          qty,
          unitPrice: toNum(line.avgPrice),
          documentType: 'descarga_venta',
          documentNumber: docNumber,
          originDest: `Pedido ${doc.orderId}`,
        },
        tx
      );
    }

    const [processed] = await tx
      .update(salesDischarge)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(salesDischarge.id, id))
      .returning();

    await writeAuditLog(
      {
        tableName: 'sales_discharge',
        operation: 'PROCESS',
        recordId: id,
        beforeData: doc,
        afterData: processed,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'descarga_venta',
        description: `Procesó descarga del pedido ${doc.orderId}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getDischargeWithLines(id);
  });
}

/** Hook para invocar al completar un pedido (opcional) */
export async function autoDischargeOnOrderCompleted(orderId: string, actor?: AuditActor) {
  const built = await buildDischargeFromOrder(orderId);
  if (!built.lines.length) return null;

  const areaId = built.lines[0].productionAreaId;
  const created = await createSalesDischargeFromOrder(orderId, areaId, actor);
  if (!created) return null;

  return processSalesDischarge(created.id, actor);
}

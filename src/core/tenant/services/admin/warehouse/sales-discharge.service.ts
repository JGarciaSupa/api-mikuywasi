import { eq, and, desc, ilike, count, sql, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  salesDischarge,
  salesDischargeLines,
  orders,
  orderItems,
  recipes,
  recipeLines,
  branchRecipeAreas,
  items,
  products,
  storageAreas,
  measurementUnits,
} from '../../../../../db/tenant/schema';
import { buildExtrasDischargeLines } from './extras.service';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundMoney, roundQty } from './shared/numbers';
import { writeAuditLog } from './shared/audit.service';
import { applyStockExit, applyStockEntry } from './shared/stock-movement.service';
import { fetchItemWithUnits } from './shared/item-select';
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

export interface DischargeSkipReason {
  productId: number;
  productName: string;
  reason: string;
}

/** Calcula líneas de descarga a partir de un pedido (cualquier estado activo) */
export async function buildDischargeFromOrder(orderId: string) {
  const db = getTenantDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');

  const oItems = await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
  const calculated: {
    itemId: number;
    recipeId: number | null;
    qty: number;
    unit: string;
    avgPrice: number;
    lineCost: number;
    productionAreaId: number;
  }[] = [];
  const skipped: DischargeSkipReason[] = [];

  for (const oi of oItems) {
    if (!oi.productId) continue;

    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.productId, oi.productId), eq(recipes.isActive, true)))
      .limit(1);

    if (!recipe) {
      skipped.push({
        productId: oi.productId,
        productName: oi.productName,
        reason: 'Sin receta activa configurada',
      });
      continue;
    }

    let [bra] = await db
      .select()
      .from(branchRecipeAreas)
      .where(
        and(
          eq(branchRecipeAreas.productId, oi.productId),
          eq(branchRecipeAreas.branchId, order.branchId)
        )
      )
      .limit(1);

    if (!bra?.areaId) {
      skipped.push({
        productId: oi.productId,
        productName: oi.productName,
        reason: `Sin área de producción configurada para esta sucursal (sucursal #${order.branchId})`,
      });
      continue;
    }

    const lines = await db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeId, recipe.id));

    const orderQty = toNum(oi.quantity);
    const servings = toNum(recipe.servings) || 1;
    const yieldFactor = (toNum(recipe.yieldPct) || 100) / 100;

    for (const rl of lines) {
      if (rl.isOptional) continue;

      const item = await fetchItemWithUnits(db, rl.itemId);
      if (!item?.recipeDischarge) continue;

      const recipeQty = roundQty((toNum(rl.qty) / servings) * orderQty / yieldFactor);
      const factor = toNum(item.conversionFactor);
      const needsConversion = factor > 0 && item.costUnitId && item.ledgerUnitId !== item.costUnitId;
      const stockQty = needsConversion ? recipeQty / factor : recipeQty;
      const avgPrice = toNum(item.avgPrice);

      calculated.push({
        itemId: rl.itemId,
        recipeId: recipe.id,
        qty: recipeQty,
        unit: rl.unit,
        avgPrice,
        lineCost: roundMoney(stockQty * avgPrice),
        productionAreaId: bra.areaId,
      });
    }

    const extraLines = await buildExtrasDischargeLines(db, oi.id, bra.areaId);
    for (const el of extraLines) {
      calculated.push({ ...el, recipeId: null, productionAreaId: bra.areaId });
    }
  }

  return { order, lines: calculated, skipped };
}

export async function createSalesDischargeFromOrder(orderId: string, areaId?: number | null, actor?: AuditActor) {
  const db = getTenantDb();
  const existing = await getSalesDischargeByOrderId(orderId);
  if (existing) throw new Error('Ya existe una descarga para este pedido');

  const { order, lines, skipped } = await buildDischargeFromOrder(orderId);
  if (!lines.length) throw new Error('No hay ingredientes con receta para descargar');

  const totalCost = roundMoney(lines.reduce((s, l) => s + l.lineCost, 0));

  const docId = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(salesDischarge)
      .values({
        orderId,
        branchId: order.branchId,
        areaId: areaId || null,
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
        areaId: l.productionAreaId,
        qty: String(l.qty),
        unit: l.unit,
        avgPrice: String(l.avgPrice),
        lineCost: String(l.lineCost),
      }))
    );

    return doc.id;
  });

  const discharge = await getDischargeWithLines(docId);
  return { discharge, skipped };
}

export async function processSalesDischarge(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const doc = await getDischargeWithLines(id);
  if (!doc) throw new Error('Descarga no encontrada');
  if (doc.status !== 'draft') throw new Error('La descarga ya fue procesada');

  const docNumber = `DV-${doc.orderId}`;

  await db.transaction(async (tx) => {
    for (const line of doc.lines) {
      const recipeQty = toNum(line.qty);
      if (recipeQty <= 0) continue;

      const targetAreaId = line.areaId ?? doc.areaId;
      if (!targetAreaId) {
        const [itemRow] = await tx.select({ name: items.shortDescription }).from(items).where(eq(items.id, line.itemId));
        const itemName = itemRow?.name ?? `insumo #${line.itemId}`;
        throw new Error(`El insumo "${itemName}" no tiene un área de almacenamiento especificada en la descarga.`);
      }

      const lineItem = await fetchItemWithUnits(db, line.itemId);
      const factor = toNum(lineItem?.conversionFactor);
      const needsConversion = factor > 0 && lineItem?.costUnitId && lineItem?.ledgerUnitId !== lineItem?.costUnitId
        && line.unit !== lineItem?.ledgerUnit;
      const stockQty = needsConversion ? recipeQty / factor : recipeQty;

      await applyStockExit(
        {
          branchId: doc.branchId,
          itemId: line.itemId,
          areaId: targetAreaId,
          qty: stockQty,
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
  });

  return getDischargeWithLines(id);
}

/** Hook para invocar al crear un pedido — descuenta stock inmediatamente */
export async function autoDischargeOnOrderCreated(
  orderId: string,
  actor?: AuditActor
): Promise<{ discharge: Awaited<ReturnType<typeof processSalesDischarge>> | null; skipped: DischargeSkipReason[] }> {
  const built = await buildDischargeFromOrder(orderId);

  if (!built.lines.length) {
    return { discharge: null, skipped: built.skipped };
  }

  const areaId = built.lines[0].productionAreaId;
  const created = await createSalesDischargeFromOrder(orderId, areaId, actor);
  if (!created.discharge) {
    return { discharge: null, skipped: built.skipped };
  }

  const discharge = await processSalesDischarge(created.discharge.id, actor);
  return { discharge, skipped: built.skipped };
}

/** Revierte la descarga de un pedido (cancel): repone stock y marca voided */
export async function reverseDischargeForOrder(orderId: string, actor?: AuditActor) {
  const db = getTenantDb();
  const discharge = await getSalesDischargeByOrderId(orderId);
  if (!discharge || discharge.status !== 'processed') return null;

  const docNumber = `DV-VOID-${orderId}`;

  await db.transaction(async (tx) => {
    for (const line of discharge.lines) {
      const recipeQty = toNum(line.qty);
      if (recipeQty <= 0) continue;

      const targetAreaId = line.areaId ?? discharge.areaId;
      if (!targetAreaId) continue;

      const lineItem = await fetchItemWithUnits(db, line.itemId);
      const factor = toNum(lineItem?.conversionFactor);
      const needsConversion = factor > 0 && lineItem?.costUnitId && lineItem?.ledgerUnitId !== lineItem?.costUnitId
        && line.unit !== lineItem?.ledgerUnit;
      const stockQty = needsConversion ? recipeQty / factor : recipeQty;

      await applyStockEntry(
        {
          branchId: discharge.branchId,
          itemId: line.itemId,
          areaId: targetAreaId,
          qty: stockQty,
          unitPrice: toNum(line.avgPrice),
          documentType: 'reverso_descarga',
          documentNumber: docNumber,
          originDest: `Cancelación pedido ${orderId}`,
        },
        tx
      );
    }

    await tx
      .update(salesDischarge)
      .set({ status: 'voided' })
      .where(eq(salesDischarge.id, discharge.id));

    await writeAuditLog(
      {
        tableName: 'sales_discharge',
        operation: 'VOID',
        recordId: discharge.id,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'descarga_venta',
        description: `Reverso por cancelación del pedido ${orderId}`,
        ipAddress: actor?.ip,
      },
      tx
    );
  });
}

export async function listSalesDischarges(filters: {
  page?: number;
  limit?: number;
  status?: string;
  orderId?: string;
  branchId?: number;
}) {
  const db = getTenantDb();
  const page = Math.max(1, filters.page ?? 1);
  const lim = Math.min(50, filters.limit ?? 20);
  const offset = (page - 1) * lim;

  const conditions = [];
  if (filters.status) conditions.push(eq(salesDischarge.status, filters.status as any));
  if (filters.orderId) conditions.push(ilike(salesDischarge.orderId, `%${filters.orderId}%`));
  if (filters.branchId) conditions.push(eq(salesDischarge.branchId, filters.branchId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(salesDischarge).where(where);

  const rows = await db
    .select({
      id: salesDischarge.id,
      orderId: salesDischarge.orderId,
      areaId: salesDischarge.areaId,
      areaName: storageAreas.name,
      date: salesDischarge.date,
      status: salesDischarge.status,
      totalCost: salesDischarge.totalCost,
      createdBy: salesDischarge.createdBy,
      createdAt: salesDischarge.createdAt,
      processedAt: salesDischarge.processedAt,
    })
    .from(salesDischarge)
    .leftJoin(storageAreas, eq(salesDischarge.areaId, storageAreas.id))
    .where(where)
    .orderBy(desc(salesDischarge.createdAt))
    .limit(lim)
    .offset(offset);

  return {
    data: rows,
    pagination: { total, totalPages: Math.ceil(total / lim), currentPage: page, limit: lim },
  };
}

export async function getSalesDischargeDetail(id: number) {
  const db = getTenantDb();
  const [doc] = await db
    .select({
      id: salesDischarge.id,
      orderId: salesDischarge.orderId,
      areaId: salesDischarge.areaId,
      areaName: storageAreas.name,
      date: salesDischarge.date,
      status: salesDischarge.status,
      totalCost: salesDischarge.totalCost,
      createdBy: salesDischarge.createdBy,
      createdAt: salesDischarge.createdAt,
      processedAt: salesDischarge.processedAt,
    })
    .from(salesDischarge)
    .leftJoin(storageAreas, eq(salesDischarge.areaId, storageAreas.id))
    .where(eq(salesDischarge.id, id));

  if (!doc) return null;

  const lu = alias(measurementUnits, 'lu');
  const lines = await db
    .select({
      id: salesDischargeLines.id,
      itemId: salesDischargeLines.itemId,
      itemName: items.shortDescription,
      itemUnit: sql<string>`COALESCE(${lu.code}, '')`.as('item_unit'),
      recipeId: salesDischargeLines.recipeId,
      areaId: salesDischargeLines.areaId,
      areaName: storageAreas.name,
      qty: salesDischargeLines.qty,
      unit: salesDischargeLines.unit,
      avgPrice: salesDischargeLines.avgPrice,
      lineCost: salesDischargeLines.lineCost,
    })
    .from(salesDischargeLines)
    .leftJoin(items, eq(salesDischargeLines.itemId, items.id))
    .leftJoin(lu, eq(items.ledgerUnitId, lu.id))
    .leftJoin(storageAreas, eq(salesDischargeLines.areaId, storageAreas.id))
    .where(eq(salesDischargeLines.dischargeId, id));

  return { ...doc, lines };
}

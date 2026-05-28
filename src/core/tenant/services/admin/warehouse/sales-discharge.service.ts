import { eq, and, desc, ilike, count } from 'drizzle-orm';
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
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundMoney, roundQty } from './shared/numbers';
import { writeAuditLog } from './shared/audit.service';
import { applyStockExit, applyStockEntry } from './shared/stock-movement.service';
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

/** Calcula líneas de descarga a partir de un pedido (cualquier estado activo) */
export async function buildDischargeFromOrder(orderId: string) {
  console.log(`[buildDischargeFromOrder] Iniciando para pedido: ${orderId}`);
  const db = getTenantDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) {
    console.log(`[buildDischargeFromOrder] Pedido no encontrado: ${orderId}`);
    throw new Error('Pedido no encontrado');
  }

  const oItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  console.log(`[buildDischargeFromOrder] Encontrados ${oItems.length} items en el pedido`);
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
    console.log(`[buildDischargeFromOrder] Evaluando item: ${oi.productName} (productId: ${oi.productId})`);
    if (!oi.productId) continue;

    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.productId, oi.productId), eq(recipes.isActive, true)))
      .limit(1);

    if (!recipe) {
      console.log(`[buildDischargeFromOrder] Sin receta activa para productId: ${oi.productId}`);
      continue;
    }

    // Obtener el área de producción para esta sucursal y producto
    const [bra] = await db
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
      console.log(`[buildDischargeFromOrder] Sin branchRecipeAreas (área de producción) para productId: ${oi.productId} en branchId: ${order.branchId}`);
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
        productionAreaId: bra.areaId,
      });
    }
  }

  console.log(`[buildDischargeFromOrder] Líneas calculadas a descargar: ${calculated.length}`);
  return { order, lines: calculated };
}

export async function createSalesDischargeFromOrder(orderId: string, areaId: number, actor?: AuditActor) {
  const db = getTenantDb();
  const existing = await getSalesDischargeByOrderId(orderId);
  if (existing) throw new Error('Ya existe una descarga para este pedido');

  const { order, lines } = await buildDischargeFromOrder(orderId);
  if (!lines.length) throw new Error('No hay ingredientes con receta para descargar');

  const totalCost = roundMoney(lines.reduce((s, l) => s + l.lineCost, 0));

  const docId = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(salesDischarge)
      .values({
        orderId,
        branchId: order.branchId,
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

    return doc.id;
  });

  return getDischargeWithLines(docId);
}

export async function processSalesDischarge(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const doc = await getDischargeWithLines(id);
  if (!doc) throw new Error('Descarga no encontrada');
  if (doc.status !== 'draft') throw new Error('La descarga ya fue procesada');

  const docNumber = `DV-${doc.orderId}`;

  await db.transaction(async (tx) => {
    for (const line of doc.lines) {
      const qty = toNum(line.qty);
      if (qty <= 0) continue;

      await applyStockExit(
        {
          branchId: doc.branchId,
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
  });

  return getDischargeWithLines(id);
}

/** Hook para invocar al crear un pedido — descuenta stock inmediatamente */
export async function autoDischargeOnOrderCreated(orderId: string, actor?: AuditActor) {
  console.log(`[autoDischargeOnOrderCreated] Iniciando trigger para pedido: ${orderId}`);
  const built = await buildDischargeFromOrder(orderId);
  if (!built.lines.length) {
    console.log(`[autoDischargeOnOrderCreated] No hay líneas para descargar. Abortando auto-discharge.`);
    return null;
  }

  const areaId = built.lines[0].productionAreaId;
  console.log(`[autoDischargeOnOrderCreated] Creando documento de descarga en areaId: ${areaId}`);
  const created = await createSalesDischargeFromOrder(orderId, areaId, actor);
  if (!created) {
    console.log(`[autoDischargeOnOrderCreated] Falla al crear el documento (createSalesDischargeFromOrder retornó falso)`);
    return null;
  }

  console.log(`[autoDischargeOnOrderCreated] Procesando descarga ID: ${created.id}`);
  return processSalesDischarge(created.id, actor);
}

/** Revierte la descarga de un pedido (cancel): repone stock y marca voided */
export async function reverseDischargeForOrder(orderId: string, actor?: AuditActor) {
  const db = getTenantDb();
  const discharge = await getSalesDischargeByOrderId(orderId);
  if (!discharge || discharge.status !== 'processed') return null;

  const docNumber = `DV-VOID-${orderId}`;

  await db.transaction(async (tx) => {
    for (const line of discharge.lines) {
      const qty = toNum(line.qty);
      if (qty <= 0) continue;
      await applyStockEntry(
        {
          branchId: discharge.branchId,
          itemId: line.itemId,
          areaId: discharge.areaId,
          qty,
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

  const lines = await db
    .select({
      id: salesDischargeLines.id,
      itemId: salesDischargeLines.itemId,
      itemName: items.shortDescription,
      itemUnit: items.ledgerUnit,
      recipeId: salesDischargeLines.recipeId,
      qty: salesDischargeLines.qty,
      unit: salesDischargeLines.unit,
      avgPrice: salesDischargeLines.avgPrice,
      lineCost: salesDischargeLines.lineCost,
    })
    .from(salesDischargeLines)
    .leftJoin(items, eq(salesDischargeLines.itemId, items.id))
    .where(eq(salesDischargeLines.dischargeId, id));

  return { ...doc, lines };
}

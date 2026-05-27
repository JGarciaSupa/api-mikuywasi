import { eq, and, asc, desc, or, inArray } from 'drizzle-orm';
import {
  items,
  storageAreas,
  warehouses,
  stockSnapshot,
  mainLedger,
  areaLedger,
  batches,
  purchasePriceHistory,
  purchaseDocuments,
  requisitions,
  stockTransfers,
  stockExits,
  portionings,
} from '../../../../../../db/tenant/schema';
import { getTenantDb, type TenantDb } from '../../../../../../utils/tenant-context';
import { toNum, roundQty, roundMoney, weightedAveragePrice } from './numbers';

export interface MovementContext {
  branchId: number;
  itemId: number;
  areaId: number;
  qty: number;
  unitPrice?: number;
  documentType: string;
  documentNumber: string;
  originDest: string;
}

async function getArea(db: TenantDb, areaId: number) {
  const [area] = await db.select().from(storageAreas).where(eq(storageAreas.id, areaId));
  if (!area) throw new Error('Área de almacén no encontrada');
  return area;
}

async function isMainLedgerArea(db: TenantDb, areaId: number): Promise<boolean> {
  // An area belongs to the main ledger if its warehouse is the central warehouse
  const [area] = await db.select().from(storageAreas).where(eq(storageAreas.id, areaId));
  if (!area) return false;
  const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, area.warehouseId));
  return wh?.isCentral ?? false;
}

async function getItem(db: TenantDb, itemId: number) {
  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) throw new Error(`Artículo ${itemId} no encontrado`);
  return item;
}

async function upsertStockSnapshot(
  db: TenantDb,
  branchId: number,
  itemId: number,
  areaId: number,
  qtyDelta: number,
  avgPrice: number
) {
  const [existing] = await db
    .select()
    .from(stockSnapshot)
    .where(and(eq(stockSnapshot.itemId, itemId), eq(stockSnapshot.areaId, areaId)));

  const prevStock = toNum(existing?.currentStock);
  const newStock = roundQty(prevStock + qtyDelta);
  const newAvg = avgPrice;
  const totalValue = roundMoney(newStock * newAvg);

  if (existing) {
    await db
      .update(stockSnapshot)
      .set({
        currentStock: String(newStock),
        avgPrice: String(newAvg),
        totalValue: String(totalValue),
        updatedAt: new Date(),
      })
      .where(eq(stockSnapshot.id, existing.id));
  } else {
    await db.insert(stockSnapshot).values({
      branchId,
      itemId,
      areaId,
      currentStock: String(newStock),
      avgPrice: String(newAvg),
      totalValue: String(totalValue),
    });
  }

  return { newStock, newAvg };
}

/** Ingreso de stock (compras, requerimientos atendidos, transferencias destino, ajuste positivo) */
export async function applyStockEntry(ctx: MovementContext, tx?: TenantDb) {
  const db = tx ?? getTenantDb();
  const area = await getArea(db, ctx.areaId);
  const item = await getItem(db, ctx.itemId);
  const qty = roundQty(ctx.qty);
  if (qty <= 0) throw new Error('La cantidad de ingreso debe ser mayor a cero');

  const unitPrice = roundMoney(ctx.unitPrice ?? toNum(item.avgPrice));
  const entryValue = roundMoney(qty * unitPrice);

  const globalStock = toNum(item.currentStock);
  const globalAvg = toNum(item.avgPrice);
  const newGlobalAvg = weightedAveragePrice(globalStock, globalAvg, qty, unitPrice);
  const newGlobalStock = roundQty(globalStock + qty);

  // Determine warehouse to get warehouseId and isCentral
  const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, area.warehouseId));
  const isCentral = wh?.isCentral ?? false;

  if (isCentral) {
    const [lastMain] = await db
      .select()
      .from(mainLedger)
      .where(and(eq(mainLedger.itemId, ctx.itemId), eq(mainLedger.areaId, ctx.areaId)))
      .orderBy(desc(mainLedger.id))
      .limit(1);

    const prevLedgerStock = toNum(lastMain?.currentStock);
    const ledgerStock = roundQty(prevLedgerStock + qty);

    await db.insert(mainLedger).values({
      branchId: ctx.branchId,
      warehouseId: area.warehouseId,
      itemId: ctx.itemId,
      areaId: ctx.areaId,
      documentType: ctx.documentType,
      documentNumber: ctx.documentNumber,
      originDest: ctx.originDest,
      entryQty: String(qty),
      exitQty: '0',
      entryPrice: String(unitPrice),
      exitPrice: '0',
      entryValue: String(entryValue),
      exitValue: '0',
      currentStock: String(ledgerStock),
      avgPrice: String(newGlobalAvg),
    });

    await db
      .update(items)
      .set({
        currentStock: String(newGlobalStock),
        avgPrice: String(newGlobalAvg),
        updatedAt: new Date(),
      })
      .where(eq(items.id, ctx.itemId));
  } else {
    const [lastArea] = await db
      .select()
      .from(areaLedger)
      .where(and(eq(areaLedger.itemId, ctx.itemId), eq(areaLedger.areaId, ctx.areaId)))
      .orderBy(desc(areaLedger.id))
      .limit(1);

    const prevLedgerStock = toNum(lastArea?.currentStock);
    const prevAvg = toNum(lastArea?.avgPrice) || globalAvg;
    const newAreaAvg = weightedAveragePrice(prevLedgerStock, prevAvg, qty, unitPrice);
    const ledgerStock = roundQty(prevLedgerStock + qty);

    await db.insert(areaLedger).values({
      branchId: ctx.branchId,
      itemId: ctx.itemId,
      areaId: ctx.areaId,
      documentType: ctx.documentType,
      documentNumber: ctx.documentNumber,
      originDest: ctx.originDest,
      entryQty: String(qty),
      exitQty: '0',
      entryPrice: String(unitPrice),
      entryValue: String(entryValue),
      exitValue: '0',
      currentStock: String(ledgerStock),
      avgPrice: String(newAreaAvg),
    });
  }

  const [snapBefore] = await db
    .select()
    .from(stockSnapshot)
    .where(and(eq(stockSnapshot.itemId, ctx.itemId), eq(stockSnapshot.areaId, ctx.areaId)));

  const snapStock = toNum(snapBefore?.currentStock);
  const snapAvg = toNum(snapBefore?.avgPrice) || globalAvg;
  const finalSnapAvg = weightedAveragePrice(snapStock, snapAvg, qty, unitPrice);

  await upsertStockSnapshot(db, ctx.branchId, ctx.itemId, ctx.areaId, qty, finalSnapAvg);

  return { qty, unitPrice, newAvg: isCentral ? newGlobalAvg : finalSnapAvg };
}

/** Salida de stock (requerimientos, transferencias origen, salidas, descarga venta, ajuste negativo) */
export async function applyStockExit(ctx: MovementContext, tx?: TenantDb) {
  const db = tx ?? getTenantDb();
  const area = await getArea(db, ctx.areaId);
  const item = await getItem(db, ctx.itemId);
  const qty = roundQty(ctx.qty);
  if (qty <= 0) throw new Error('La cantidad de salida debe ser mayor a cero');

  const unitPrice = roundMoney(ctx.unitPrice ?? toNum(item.avgPrice));
  const exitValue = roundMoney(qty * unitPrice);

  const [snap] = await db
    .select()
    .from(stockSnapshot)
    .where(and(eq(stockSnapshot.itemId, ctx.itemId), eq(stockSnapshot.areaId, ctx.areaId)));

  const available = toNum(snap?.currentStock);
  if (available < qty) {
    throw new Error(
      `Stock insuficiente en el área. Disponible: ${available}, solicitado: ${qty}`
    );
  }

  const globalStock = toNum(item.currentStock);
  const globalAvg = toNum(item.avgPrice);

  // Determine warehouse to get warehouseId and isCentral
  const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, area.warehouseId));
  const isCentral = wh?.isCentral ?? false;

  if (isCentral) {
    const [lastMain] = await db
      .select()
      .from(mainLedger)
      .where(and(eq(mainLedger.itemId, ctx.itemId), eq(mainLedger.areaId, ctx.areaId)))
      .orderBy(desc(mainLedger.id))
      .limit(1);

    const prevLedgerStock = toNum(lastMain?.currentStock);
    const ledgerStock = roundQty(Math.max(0, prevLedgerStock - qty));

    await db.insert(mainLedger).values({
      branchId: ctx.branchId,
      warehouseId: area.warehouseId,
      itemId: ctx.itemId,
      areaId: ctx.areaId,
      documentType: ctx.documentType,
      documentNumber: ctx.documentNumber,
      originDest: ctx.originDest,
      entryQty: '0',
      exitQty: String(qty),
      entryPrice: '0',
      exitPrice: String(unitPrice),
      entryValue: '0',
      exitValue: String(exitValue),
      currentStock: String(ledgerStock),
      avgPrice: String(globalAvg),
    });

    await db
      .update(items)
      .set({
        currentStock: String(roundQty(Math.max(0, globalStock - qty))),
        updatedAt: new Date(),
      })
      .where(eq(items.id, ctx.itemId));
  } else {
    const [lastArea] = await db
      .select()
      .from(areaLedger)
      .where(and(eq(areaLedger.itemId, ctx.itemId), eq(areaLedger.areaId, ctx.areaId)))
      .orderBy(desc(areaLedger.id))
      .limit(1);

    const prevLedgerStock = toNum(lastArea?.currentStock);
    const ledgerStock = roundQty(Math.max(0, prevLedgerStock - qty));
    const areaAvg = toNum(lastArea?.avgPrice) || globalAvg;

    // area_ledger no tiene exit_price; el costo de salida va en exit_value
    await db.insert(areaLedger).values({
      branchId: ctx.branchId,
      itemId: ctx.itemId,
      areaId: ctx.areaId,
      documentType: ctx.documentType,
      documentNumber: ctx.documentNumber,
      originDest: ctx.originDest,
      entryQty: '0',
      exitQty: String(qty),
      entryPrice: '0',
      entryValue: '0',
      exitValue: String(exitValue),
      currentStock: String(ledgerStock),
      avgPrice: String(areaAvg),
    });
  }

  await upsertStockSnapshot(db, ctx.branchId, ctx.itemId, ctx.areaId, -qty, toNum(snap?.avgPrice) || globalAvg);

  // FIFO en lotes si el artículo es perecible
  if (item.expiryDays > 0) {
    await consumeBatchesFifo(db, ctx.itemId, ctx.areaId, qty);
  }

  return { qty, unitPrice, exitValue };
}

async function consumeBatchesFifo(db: TenantDb, itemId: number, areaId: number, qty: number) {
  let remaining = qty;
  const activeBatches = await db
    .select()
    .from(batches)
    .where(
      and(
        eq(batches.itemId, itemId),
        eq(batches.areaId, areaId),
        inArray(batches.status, ['active', 'expiring_soon'])
      )
    )
    .orderBy(asc(batches.entryDate));

  for (const batch of activeBatches) {
    if (remaining <= 0) break;
    const batchQty = toNum(batch.currentQty);
    const consume = Math.min(remaining, batchQty);
    const newQty = roundQty(batchQty - consume);
    remaining = roundQty(remaining - consume);

    await db
      .update(batches)
      .set({
        currentQty: String(newQty),
        status: newQty <= 0 ? 'depleted' : (batch.status ?? 'active'),
      })
      .where(eq(batches.id, batch.id));
  }
}

export async function createBatchFromPurchase(
  db: TenantDb,
  params: {
    itemId: number;
    areaId: number;
    documentId: number;
    qty: number;
    entryDate: string;
    batchNumber?: string | null;
  }
) {
  const item = await getItem(db, params.itemId);
  if (item.expiryDays <= 0) return null;

  const entry = new Date(params.entryDate);
  const expiry = new Date(entry);
  expiry.setDate(expiry.getDate() + item.expiryDays);

  const [batch] = await db
    .insert(batches)
    .values({
      itemId: params.itemId,
      areaId: params.areaId,
      documentId: params.documentId,
      batchNumber: params.batchNumber ?? null,
      initialQty: String(params.qty),
      currentQty: String(params.qty),
      entryDate: params.entryDate,
      expiryDate: expiry.toISOString().slice(0, 10),
      status: 'active',
    })
    .returning();

  return batch;
}

export async function recordPurchasePriceHistory(
  db: TenantDb,
  params: {
    branchId: number;
    itemId: number;
    supplierId: number;
    documentId: number;
    purchasePrice: number;
    qty: number;
    purchaseDate: string;
    currency?: string;
  }
) {
  await db.insert(purchasePriceHistory).values({
    branchId: params.branchId,
    itemId: params.itemId,
    supplierId: params.supplierId,
    documentId: params.documentId,
    purchasePrice: String(params.purchasePrice),
    qty: String(params.qty),
    purchaseDate: params.purchaseDate,
    currency: params.currency ?? 'PEN',
  });
}

export async function assertNoDraftMovements(db: TenantDb, areaId: number) {
  const draft = 'draft' as const;

  const [purchase] = await db
    .select({ id: purchaseDocuments.id })
    .from(purchaseDocuments)
    .where(and(eq(purchaseDocuments.areaId, areaId), eq(purchaseDocuments.status, draft)))
    .limit(1);
  if (purchase) {
    throw new Error('Existen documentos de compra en estado GENERADO para esta área. Procésalos antes del ajuste.');
  }

  const [requisition] = await db
    .select({ id: requisitions.id })
    .from(requisitions)
    .where(and(eq(requisitions.areaId, areaId), eq(requisitions.status, draft)))
    .limit(1);
  if (requisition) {
    throw new Error('Existen requerimientos en estado GENERADO para esta área. Procésalos antes del ajuste.');
  }

  const [transfer] = await db
    .select({ id: stockTransfers.id })
    .from(stockTransfers)
    .where(
      and(
        or(eq(stockTransfers.sourceAreaId, areaId), eq(stockTransfers.targetAreaId, areaId)),
        eq(stockTransfers.status, draft)
      )
    )
    .limit(1);
  if (transfer) {
    throw new Error('Existen transferencias en estado GENERADO para esta área. Procésalos antes del ajuste.');
  }

  const [exit] = await db
    .select({ id: stockExits.id })
    .from(stockExits)
    .where(and(eq(stockExits.areaId, areaId), eq(stockExits.status, draft)))
    .limit(1);
  if (exit) {
    throw new Error('Existen salidas en estado GENERADO para esta área. Procésalos antes del ajuste.');
  }

  const [portioning] = await db
    .select({ id: portionings.id })
    .from(portionings)
    .where(and(eq(portionings.areaId, areaId), eq(portionings.status, draft)))
    .limit(1);
  if (portioning) {
    throw new Error('Existen porcionamientos en estado GENERADO para esta área. Procésalos antes del ajuste.');
  }
}

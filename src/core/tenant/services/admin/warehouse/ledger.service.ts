import { eq, and, desc, gte, lte, ilike } from 'drizzle-orm';
import { mainLedger, areaLedger, stockSnapshot, wasteLog, items, storageAreas, warehouses } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';

export async function getMainLedger(filters: {
  itemId?: number;
  areaId?: number;
  from?: string;
  to?: string;
  documentType?: string;
  limit?: number;
}) {
  const db = getTenantDb();
  const conditions = [];
  if (filters.itemId) conditions.push(eq(mainLedger.itemId, filters.itemId));
  if (filters.areaId) conditions.push(eq(mainLedger.areaId, filters.areaId));
  if (filters.from) conditions.push(gte(mainLedger.recordedAt, new Date(filters.from)));
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(mainLedger.recordedAt, to));
  }
  if (filters.documentType) conditions.push(ilike(mainLedger.documentType, `%${filters.documentType}%`));

  let q = db.select().from(mainLedger).orderBy(desc(mainLedger.recordedAt));
  if (conditions.length) q = q.where(and(...conditions)) as typeof q;
  if (filters.limit) q = q.limit(filters.limit) as typeof q;
  return q;
}

export async function getAreaLedger(filters: {
  itemId?: number;
  areaId?: number;
  from?: string;
  to?: string;
  documentType?: string;
  limit?: number;
}) {
  const db = getTenantDb();
  const conditions = [];
  if (filters.itemId) conditions.push(eq(areaLedger.itemId, filters.itemId));
  if (filters.areaId) conditions.push(eq(areaLedger.areaId, filters.areaId));
  if (filters.from) conditions.push(gte(areaLedger.recordedAt, new Date(filters.from)));
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(areaLedger.recordedAt, to));
  }
  if (filters.documentType) conditions.push(ilike(areaLedger.documentType, `%${filters.documentType}%`));

  let q = db.select().from(areaLedger).orderBy(desc(areaLedger.recordedAt));
  if (conditions.length) q = q.where(and(...conditions)) as typeof q;
  if (filters.limit) q = q.limit(filters.limit) as typeof q;
  return q;
}

/** Kardex unificado: central o sub según el área */
export async function getKardexByArea(
  areaId: number,
  itemId?: number,
  limit = 200,
  from?: string,
  to?: string,
  documentType?: string
) {
  const db = getTenantDb();
  const [area] = await db.select().from(storageAreas).where(eq(storageAreas.id, areaId));
  if (!area) throw new Error('Área no encontrada');

  const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, area.warehouseId));
  if (wh?.isCentral) {
    return getMainLedger({ areaId, itemId, limit, from, to, documentType });
  }
  return getAreaLedger({ areaId, itemId, limit, from, to, documentType });
}

export async function getStockByArea(areaId?: number) {
  const db = getTenantDb();
  const q = db
    .select({
      snapshot: stockSnapshot,
      itemCode: items.code,
      itemDescription: items.shortDescription,
      areaName: storageAreas.name,
    })
    .from(stockSnapshot)
    .innerJoin(items, eq(stockSnapshot.itemId, items.id))
    .innerJoin(storageAreas, eq(stockSnapshot.areaId, storageAreas.id));

  if (areaId) return q.where(eq(stockSnapshot.areaId, areaId));
  return q;
}

export async function listWasteLog(filters?: { areaId?: number; from?: string; to?: string }) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.areaId) conditions.push(eq(wasteLog.areaId, filters.areaId));
  if (filters?.from) conditions.push(gte(wasteLog.date, filters.from));
  if (filters?.to) conditions.push(lte(wasteLog.date, filters.to));

  let q = db.select().from(wasteLog).orderBy(desc(wasteLog.date));
  if (conditions.length) q = q.where(and(...conditions)) as typeof q;
  return q;
}

export async function getItemMovements(itemId: number, limit = 100) {
  const db = getTenantDb();

  const mainMovements = await db
    .select({
      id: mainLedger.id,
      itemId: mainLedger.itemId,
      areaId: mainLedger.areaId,
      recordedAt: mainLedger.recordedAt,
      documentType: mainLedger.documentType,
      documentNumber: mainLedger.documentNumber,
      originDest: mainLedger.originDest,
      entryQty: mainLedger.entryQty,
      exitQty: mainLedger.exitQty,
      entryPrice: mainLedger.entryPrice,
      exitPrice: mainLedger.exitPrice,
      entryValue: mainLedger.entryValue,
      exitValue: mainLedger.exitValue,
      currentStock: mainLedger.currentStock,
      avgPrice: mainLedger.avgPrice,
      areaName: storageAreas.name,
      warehouseName: warehouses.name,
    })
    .from(mainLedger)
    .innerJoin(storageAreas, eq(mainLedger.areaId, storageAreas.id))
    .innerJoin(warehouses, eq(mainLedger.warehouseId, warehouses.id))
    .where(eq(mainLedger.itemId, itemId));

  const areaMovements = await db
    .select({
      id: areaLedger.id,
      itemId: areaLedger.itemId,
      areaId: areaLedger.areaId,
      recordedAt: areaLedger.recordedAt,
      documentType: areaLedger.documentType,
      documentNumber: areaLedger.documentNumber,
      originDest: areaLedger.originDest,
      entryQty: areaLedger.entryQty,
      exitQty: areaLedger.exitQty,
      entryPrice: areaLedger.entryPrice,
      entryValue: areaLedger.entryValue,
      exitValue: areaLedger.exitValue,
      currentStock: areaLedger.currentStock,
      avgPrice: areaLedger.avgPrice,
      areaName: storageAreas.name,
      warehouseName: warehouses.name,
    })
    .from(areaLedger)
    .innerJoin(storageAreas, eq(areaLedger.areaId, storageAreas.id))
    .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id))
    .where(eq(areaLedger.itemId, itemId));

  const normalizedMain = mainMovements.map((m) => ({
    ...m,
    exitPrice: m.exitPrice || '0',
    isCentral: true,
  }));

  const normalizedArea = areaMovements.map((m) => ({
    ...m,
    exitPrice: '0',
    isCentral: false,
  }));

  const combined = [...normalizedMain, ...normalizedArea].sort((a, b) => {
    const timeA = a.recordedAt ? new Date(a.recordedAt).getTime() : 0;
    const timeB = b.recordedAt ? new Date(b.recordedAt).getTime() : 0;
    return timeB - timeA;
  });

  return combined.slice(0, limit);
}


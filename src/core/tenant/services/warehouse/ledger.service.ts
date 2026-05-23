import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { mainLedger, areaLedger, stockSnapshot, wasteLog, items, storageAreas } from '../../../../db/tenant/schema';
import { getTenantDb } from '../../../../utils/tenant-context';

export async function getMainLedger(filters: {
  itemId?: number;
  areaId?: number;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const db = getTenantDb();
  const conditions = [];
  if (filters.itemId) conditions.push(eq(mainLedger.itemId, filters.itemId));
  if (filters.areaId) conditions.push(eq(mainLedger.areaId, filters.areaId));
  if (filters.from) conditions.push(gte(mainLedger.recordedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(mainLedger.recordedAt, new Date(filters.to)));

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
  limit?: number;
}) {
  const db = getTenantDb();
  const conditions = [];
  if (filters.itemId) conditions.push(eq(areaLedger.itemId, filters.itemId));
  if (filters.areaId) conditions.push(eq(areaLedger.areaId, filters.areaId));
  if (filters.from) conditions.push(gte(areaLedger.recordedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(areaLedger.recordedAt, new Date(filters.to)));

  let q = db.select().from(areaLedger).orderBy(desc(areaLedger.recordedAt));
  if (conditions.length) q = q.where(and(...conditions)) as typeof q;
  if (filters.limit) q = q.limit(filters.limit) as typeof q;
  return q;
}

/** Kardex unificado: central o sub según el área */
export async function getKardexByArea(areaId: number, itemId?: number, limit = 100) {
  const db = getTenantDb();
  const [area] = await db.select().from(storageAreas).where(eq(storageAreas.id, areaId));
  if (!area) throw new Error('Área no encontrada');

  if (area.isCentral) {
    return getMainLedger({ areaId, itemId, limit });
  }
  return getAreaLedger({ areaId, itemId, limit });
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

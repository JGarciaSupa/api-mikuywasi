import { eq, and, sql, asc } from 'drizzle-orm';
import { batches, items, storageAreas } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { toNum } from './shared/numbers';

export async function listBatches(filters?: {
  areaId?: number;
  itemId?: number;
  status?: string;
  expiringOnly?: boolean;
}) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.areaId) conditions.push(eq(batches.areaId, filters.areaId));
  if (filters?.itemId) conditions.push(eq(batches.itemId, filters.itemId));
  if (filters?.status) {
    conditions.push(eq(batches.status, filters.status as 'active' | 'expiring_soon' | 'expired' | 'depleted'));
  }

  let q = db
    .select({
      batch: batches,
      itemCode: items.code,
      itemDescription: items.shortDescription,
      areaName: storageAreas.name,
    })
    .from(batches)
    .innerJoin(items, eq(batches.itemId, items.id))
    .innerJoin(storageAreas, eq(batches.areaId, storageAreas.id))
    .orderBy(asc(batches.expiryDate));

  if (filters?.expiringOnly) {
    conditions.push(sql`${batches.status} IN ('expiring_soon', 'expired')`);
  }

  if (conditions.length) return q.where(and(...conditions));
  return q;
}

/** Actualiza estados de lotes según fecha de vencimiento (job manual o cron) */
export async function refreshBatchStatuses(alertDays = 3) {
  const db = getTenantDb();
  const today = new Date().toISOString().slice(0, 10);
  const alertDate = new Date();
  alertDate.setDate(alertDate.getDate() + alertDays);
  const alertStr = alertDate.toISOString().slice(0, 10);

  const all = await db
    .select()
    .from(batches)
    .where(sql`${batches.status} != 'depleted'`);

  const updates = [];
  for (const batch of all) {
    if (toNum(batch.currentQty) <= 0) {
      updates.push({ id: batch.id, status: 'depleted' as const });
      continue;
    }
    if (!batch.expiryDate) continue;
    const expiry = String(batch.expiryDate);
    let status: 'active' | 'expiring_soon' | 'expired' = 'active';
    if (expiry < today) status = 'expired';
    else if (expiry <= alertStr) status = 'expiring_soon';

    if (status !== batch.status) {
      updates.push({ id: batch.id, status });
    }
  }

  for (const u of updates) {
    await db.update(batches).set({ status: u.status }).where(eq(batches.id, u.id));
  }

  return { updated: updates.length };
}

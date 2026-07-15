import { exchangeRate } from '@/db/tenant/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

export async function getAllExchangeRates(branchId?: number) {
  const db = getTenantDb();
  return await db.select().from(exchangeRate)
    .where(branchId ? eq(exchangeRate.branchId, branchId) : undefined)
    .orderBy(desc(exchangeRate.dateExchangeRate));
}

export async function getExchangeRateById(id: number) {
  const db = getTenantDb();
  const [record] = await db.select().from(exchangeRate).where(eq(exchangeRate.id, id));
  return record;
}

export async function createExchangeRate(data: any) {
  const db = getTenantDb();
  const targetDateStr = typeof data.dateExchangeRate === 'string' 
    ? data.dateExchangeRate.substring(0, 10) 
    : new Date(data.dateExchangeRate).toISOString().substring(0, 10);

  let conditions: any[] = [
    eq(exchangeRate.dateExchangeRate, targetDateStr)
  ];

  if (data.branchId) {
    conditions.push(eq(exchangeRate.branchId, data.branchId));
  } else {
    conditions.push(isNull(exchangeRate.branchId));
  }

  const [existing] = await db.select().from(exchangeRate).where(and(...conditions)).limit(1);

  if (existing) {
    return await updateExchangeRate(existing.id, data);
  }

  const [newRecord] = await db.insert(exchangeRate).values({
    ...data,
    dateExchangeRate: targetDateStr,
    currencyFrom: data.currencyFrom,
    currencyTo: data.currencyTo,
    buyExchangeRate: data.buyExchangeRate != null ? String(data.buyExchangeRate) : null,
    sellExchangeRate: data.sellExchangeRate != null ? String(data.sellExchangeRate) : null,
    hotelExchangeRate: data.hotelExchangeRate != null ? String(data.hotelExchangeRate) : null,
    officialExchangeRate: data.officialExchangeRate != null ? String(data.officialExchangeRate) : null,
    branchId: data.branchId,
    userId: data.userId,
  }).returning();
  return newRecord;
}

export async function updateExchangeRate(id: number, data: any) {
  const db = getTenantDb();
  
  const updateData: any = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.dateExchangeRate) {
    updateData.dateExchangeRate = typeof data.dateExchangeRate === 'string' 
      ? data.dateExchangeRate.substring(0, 10) 
      : new Date(data.dateExchangeRate).toISOString().substring(0, 10);
  }
  if (data.currencyFrom !== undefined) updateData.currencyFrom = data.currencyFrom;
  if (data.currencyTo !== undefined) updateData.currencyTo = data.currencyTo;
  if (data.buyExchangeRate !== undefined) updateData.buyExchangeRate = data.buyExchangeRate != null ? String(data.buyExchangeRate) : null;
  if (data.sellExchangeRate !== undefined) updateData.sellExchangeRate = data.sellExchangeRate != null ? String(data.sellExchangeRate) : null;
  if (data.hotelExchangeRate !== undefined) updateData.hotelExchangeRate = data.hotelExchangeRate != null ? String(data.hotelExchangeRate) : null;
  if (data.officialExchangeRate !== undefined) updateData.officialExchangeRate = data.officialExchangeRate != null ? String(data.officialExchangeRate) : null;
  if (data.branchId !== undefined) updateData.branchId = data.branchId;
  if (data.userId !== undefined) updateData.userId = data.userId;

  const [updatedRecord] = await db
    .update(exchangeRate)
    .set(updateData)
    .where(eq(exchangeRate.id, id))
    .returning();
  return updatedRecord;
}

export async function deleteExchangeRate(id: number) {
  const db = getTenantDb();
  const [deletedRecord] = await db
    .delete(exchangeRate)
    .where(eq(exchangeRate.id, id))
    .returning();
  return deletedRecord;
}

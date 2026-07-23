import { eq } from 'drizzle-orm';
import { masterDb } from '@/db';
import { salesChannelClassifications } from '@/db/master/schema';
import type { CreateSalesChannelClassificationInput, UpdateSalesChannelClassificationInput } from '../validations/sales-channel-classifications.validation';

export async function getAllSalesChannelClassifications() {
  return masterDb.select().from(salesChannelClassifications);
}

export async function getSalesChannelClassificationByCode(code: string) {
  const [classification] = await masterDb.select().from(salesChannelClassifications).where(eq(salesChannelClassifications.code, code));
  return classification;
}

export async function createSalesChannelClassification(data: CreateSalesChannelClassificationInput) {
  const existing = await getSalesChannelClassificationByCode(data.code);
  if (existing) {
    throw new Error('Ya existe una clasificación con ese código');
  }

  const [created] = await masterDb.insert(salesChannelClassifications).values(data).returning();
  return created;
}

export async function updateSalesChannelClassification(code: string, data: UpdateSalesChannelClassificationInput) {
  const [updated] = await masterDb
    .update(salesChannelClassifications)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(salesChannelClassifications.code, code))
    .returning();
  return updated;
}

export async function deleteSalesChannelClassification(code: string) {
  const [deleted] = await masterDb
    .delete(salesChannelClassifications)
    .where(eq(salesChannelClassifications.code, code))
    .returning();
  return deleted;
}

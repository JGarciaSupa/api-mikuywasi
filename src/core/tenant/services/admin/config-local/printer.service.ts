import { printers, kitchenStations } from '@/db/tenant/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

export async function listPrinters(branchId: number) {
  const db = getTenantDb();
  return db
    .select()
    .from(printers)
    .where(eq(printers.branchId, branchId))
    .orderBy(asc(printers.name));
}

export async function getPrinterById(id: number) {
  const db = getTenantDb();
  const [printer] = await db.select().from(printers).where(eq(printers.id, id));
  return printer;
}

export async function createPrinter(data: any) {
  const db = getTenantDb();
  const [newPrinter] = await db.insert(printers).values(data).returning();
  return newPrinter;
}

export async function updatePrinter(id: number, data: any) {
  const db = getTenantDb();
  const [updated] = await db
    .update(printers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(printers.id, id))
    .returning();
  return updated;
}

export async function deletePrinter(id: number) {
  const db = getTenantDb();
  // Clear reference from kitchen stations first (onDelete: set null handles this at DB level, but explicit is safe)
  await db.update(kitchenStations).set({ printerId: null }).where(eq(kitchenStations.printerId, id));
  const [deleted] = await db.delete(printers).where(eq(printers.id, id)).returning();
  return deleted;
}

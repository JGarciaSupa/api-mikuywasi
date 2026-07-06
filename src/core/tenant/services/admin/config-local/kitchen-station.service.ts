import { kitchenStations, productKitchenStations } from '@/db/tenant/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

// ─── Catálogo de estaciones ──────────────────────────────────────────────────

export async function listKitchenStations() {
  const db = getTenantDb();
  return db.select().from(kitchenStations).orderBy(asc(kitchenStations.name));
}

export async function getKitchenStationById(id: number) {
  const db = getTenantDb();
  const [station] = await db.select().from(kitchenStations).where(eq(kitchenStations.id, id));
  return station;
}

export async function createKitchenStation(data: any) {
  const db = getTenantDb();

  const existing = await db.select({ id: kitchenStations.id })
    .from(kitchenStations)
    .where(eq(kitchenStations.code, data.code));

  if (existing.length > 0) {
    throw new Error(`Ya existe una estación con el código "${data.code}"`);
  }

  const [newStation] = await db.insert(kitchenStations).values(data).returning();
  return newStation;
}

export async function updateKitchenStation(id: number, data: any) {
  const db = getTenantDb();

  if (data.code) {
    const existing = await db.select({ id: kitchenStations.id })
      .from(kitchenStations)
      .where(eq(kitchenStations.code, data.code));

    if (existing.length > 0 && existing[0].id !== id) {
      throw new Error(`Ya existe una estación con el código "${data.code}"`);
    }
  }

  const [updated] = await db
    .update(kitchenStations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(kitchenStations.id, id))
    .returning();
  return updated;
}

export async function deleteKitchenStation(id: number) {
  const db = getTenantDb();
  const [deleted] = await db
    .delete(kitchenStations)
    .where(eq(kitchenStations.id, id))
    .returning();
  return deleted;
}

// ─── Asignación de estaciones a productos ───────────────────────────────────

export async function getStationsForProduct(productId: number) {
  const db = getTenantDb();

  const assignments = await db
    .select({ stationId: productKitchenStations.stationId })
    .from(productKitchenStations)
    .where(eq(productKitchenStations.productId, productId));

  if (!assignments.length) return [];

  const stationIds = assignments.map((a) => a.stationId);

  return db
    .select()
    .from(kitchenStations)
    .where(and(inArray(kitchenStations.id, stationIds), eq(kitchenStations.isActive, true)))
    .orderBy(asc(kitchenStations.name));
}

export async function assignStationToProduct(productId: number, stationId: number) {
  const db = getTenantDb();
  const [row] = await db
    .insert(productKitchenStations)
    .values({ productId, stationId })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function unassignStationFromProduct(productId: number, stationId: number) {
  const db = getTenantDb();
  await db
    .delete(productKitchenStations)
    .where(
      and(
        eq(productKitchenStations.productId, productId),
        eq(productKitchenStations.stationId, stationId),
      )
    );
}

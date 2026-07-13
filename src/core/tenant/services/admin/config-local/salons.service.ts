import { salons } from '@/db/tenant/schema';
import { eq } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

/**
 * Obtener los salones de UNA sucursal. branchId es obligatorio — sin esto, un
 * tenant con varias sedes mezclaría salones de sucursales ajenas.
 */
export async function getAllSalons(branchId: number) {
  const db = getTenantDb();
  return db.select().from(salons)
    .where(eq(salons.branchId, branchId))
    .orderBy(salons.createdAt);
}

/**
 * Obtener un salón por ID
 */
export async function getSalonById(id: string) {
  const db = getTenantDb();
  const [salon] = await db.select().from(salons).where(eq(salons.id, id));
  return salon;
}

/**
 * Crear un nuevo salón
 */
export async function createSalon(data: { name: string; branchId: number }) {
  const db = getTenantDb();
  const [newSalon] = await db.insert(salons).values({
    name: data.name,
    branchId: data.branchId,
  }).returning();
  return newSalon;
}

/**
 * Actualizar un salón existente
 */
export async function updateSalon(id: string, data: { name: string }) {
  const db = getTenantDb();
  const [updatedSalon] = await db
    .update(salons)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(salons.id, id))
    .returning();
  return updatedSalon;
}

/**
 * Eliminar un salón. Sus mesas NO se eliminan: la FK salon_id de
 * restaurant_tables es ON DELETE SET NULL, así que quedan "sin salón".
 */
export async function deleteSalon(id: string) {
  const db = getTenantDb();
  const [deletedSalon] = await db
    .delete(salons)
    .where(eq(salons.id, id))
    .returning();
  return deletedSalon;
}

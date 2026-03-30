import { db } from '../../db';
import { plans } from '../../db/schema';
import { eq, asc, isNull } from 'drizzle-orm';

/**
 * Obtener todos los planes (incluyendo soft deleted)
 */
export async function getAllPlans() {
  return await db.select().from(plans).where(isNull(plans.deletedAt)).orderBy(asc(plans.order));
}

/**
 * Crear un nuevo plan
 */
export async function createPlan(data: any) {
  const [newPlan] = await db.insert(plans).values(data).returning();
  return newPlan;
}

/**
 * Actualizar un plan existente
 */
export async function updatePlan(id: number, data: any) {
  const [updatedPlan] = await db
    .update(plans)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(plans.id, id))
    .returning();
  return updatedPlan;
}

/**
 * Eliminar un plan (soft delete)
 */
export async function softDeletePlan(id: number) {
  const [deletedPlan] = await db
    .update(plans)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(plans.id, id))
    .returning();
  return deletedPlan;
}

/**
 * Actualizar visibilidad de un plan
 */
export async function updateVisibility(id: number, visible: boolean) {
  const [updatedPlan] = await db
    .update(plans)
    .set({ visible, updatedAt: new Date() })
    .where(eq(plans.id, id))
    .returning();
  return updatedPlan;
}

/**
 * Reordenar planes
 */
export async function reorderPlans(plansList: { id: number; order: number }[]) {
  // Usamos una transacción para asegurar que todos los cambios se apliquen
  return await db.transaction(async (tx) => {
    const results = [];
    for (const item of plansList) {
      const [updated] = await tx
        .update(plans)
        .set({ order: item.order, updatedAt: new Date() })
        .where(eq(plans.id, item.id))
        .returning();
      results.push(updated);
    }
    return results;
  });
}

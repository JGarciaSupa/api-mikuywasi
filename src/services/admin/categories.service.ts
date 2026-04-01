import { db } from '../../db';
import { categories } from '../../db/schema';
import { eq, asc, and, sql } from 'drizzle-orm';

/**
 * Obtener todas las categorías de un tenant
 */
export async function getAllCategories(tenantId: number) {
  return await db.select().from(categories)
    .where(eq(categories.tenantId, tenantId))
    .orderBy(asc(categories.order));
}

/**
 * Obtener una categoría por ID
 */
export async function getCategoryById(id: number) {
  const [category] = await db.select().from(categories).where(eq(categories.id, id));
  return category;
}

/**
 * Crear una nueva categoría
 */
export async function createCategory(data: any) {
  // Verificar límite de 50 categorías
  const [totalResult] = await db.select({ count: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.tenantId, data.tenantId));

  if (Number(totalResult?.count || 0) >= 50) {
    throw new Error('Solo se permite un máximo de 50 categorías por tenant');
  }

  const [newCategory] = await db.insert(categories).values(data).returning();
  return newCategory;
}

/**
 * Actualizar una categoría existente
 */
export async function updateCategory(id: number, data: any) {
  const [updatedCategory] = await db
    .update(categories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(categories.id, id))
    .returning();
  return updatedCategory;
}

/**
 * Eliminar una categoría (hard delete)
 */
export async function deleteCategory(id: number) {
  const [deletedCategory] = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning();
  return deletedCategory;
}

/**
 * Reordenar categorías
 */
export async function reorderCategories(list: { id: number; order: number }[]) {
  return await db.transaction(async (tx) => {
    const results = [];
    for (const item of list) {
      const [updated] = await tx
        .update(categories)
        .set({ order: item.order, updatedAt: new Date() })
        .where(eq(categories.id, item.id))
        .returning();
      results.push(updated);
    }
    return results;
  });
}

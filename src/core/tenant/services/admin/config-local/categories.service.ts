import { categories } from '@/db/tenant/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

/**
 * Obtener todas las categorías
 */
export async function getAllCategories() {
  const db = getTenantDb();
  return await db.select().from(categories)
    .orderBy(asc(categories.order));
}

/**
 * Obtener una categoría por ID
 */
export async function getCategoryById(id: number) {
  const db = getTenantDb();
  const [category] = await db.select().from(categories).where(eq(categories.id, id));
  return category;
}

/**
 * Crear una nueva categoría
 */
export async function createCategory(data: any) {
  const db = getTenantDb();
  const [totalResult] = await db.select({ count: sql<number>`count(*)` })
    .from(categories);

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
  const db = getTenantDb();
  const [updatedCategory] = await db
    .update(categories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(categories.id, id))
    .returning();
  return updatedCategory;
}

/**
 * Eliminar una categoría
 */
export async function deleteCategory(id: number) {
  const db = getTenantDb();
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
  const db = getTenantDb();
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

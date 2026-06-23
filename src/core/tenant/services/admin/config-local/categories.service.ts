import { categories } from '@/db/tenant/schema';
import { eq, asc, sql, or, isNull, and } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

/**
 * Obtener todas las categorías principales (sin parentId)
 */
export async function getAllCategories(branchId?: number) {
  const db = getTenantDb();

  const conditions = [isNull(categories.parentId)];

  if (branchId) {
    conditions.push(
      or(eq(categories.branchId, branchId), isNull(categories.branchId))!
    );
  }

  return await db.select().from(categories)
    .where(and(...conditions))
    .orderBy(asc(categories.order));
}

/**
 * Obtener subcategorías de una categoría padre
 */
export async function getSubcategoriesByParentId(parentId: number, branchId?: number) {
  const db = getTenantDb();

  const conditions = [eq(categories.parentId, parentId)];

  if (branchId) {
    conditions.push(
      or(eq(categories.branchId, branchId), isNull(categories.branchId))!
    );
  }

  return await db.select().from(categories)
    .where(and(...conditions))
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
 * Crear una nueva categoría o subcategoría
 */
export async function createCategory(data: any) {
  const db = getTenantDb();

  // Si no tiene parentId, es categoría principal: limitar a 50
  if (!data.parentId) {
    const [totalResult] = await db.select({ count: sql<number>`count(*)` })
      .from(categories)
      .where(isNull(categories.parentId));

    if (Number(totalResult?.count || 0) >= 50) {
      throw new Error('Solo se permite un máximo de 50 categorías por tenant');
    }
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

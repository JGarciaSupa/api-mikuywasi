import { tables } from '@/db/tenant/schema';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getTenantDb } from '@/utils/tenant-context';

/**
 * Obtener todas las mesas de un tenant
 */
export async function getAllTables() {
  const db = getTenantDb();
  return await db.select().from(tables)
    .orderBy(tables.createdAt);
}

/**
 * Obtener una mesa por ID
 */
export async function getTableById(id: number) {
  const db = getTenantDb();
  const [table] = await db.select().from(tables).where(eq(tables.id, id));
  return table;
}

/**
 * Crear una nueva mesa con slug autogenerado y reintentos en caso de colisión
 */
export async function createTable(data: { name: string }) {
  const db = getTenantDb();
  // 1. Verificar límite de 50 mesas por tenant
  const [totalResult] = await db.select({ count: sql<number>`count(*)` })
    .from(tables);

  if (Number(totalResult?.count || 0) >= 50) {
    throw new Error('Solo se permite un máximo de 50 mesas por tenant');
  }

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      const slug = nanoid(8);
      const [newTable] = await db.insert(tables).values({
        ...data,
        slug,
      }).returning();

      return newTable;
    } catch (error: any) {
      // Si el error es de unicidad (slug o tenant_slug_unique)
      if (error.code === '23505') {
        attempts++;
        if (attempts === maxAttempts) {
          throw new Error('No se pudo generar un identificador único para la mesa después de varios intentos');
        }
        continue;
      }
      throw error;
    }
  }
}

/**
 * Actualizar una mesa existente
 */
export async function updateTable(id: number, data: { name: string }) {
  const db = getTenantDb();
  const [updatedTable] = await db
    .update(tables)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tables.id, id))
    .returning();
  return updatedTable;
}

/**
 * Eliminar una mesa
 */
export async function deleteTable(id: number) {
  const db = getTenantDb();
  const [deletedTable] = await db
    .delete(tables)
    .where(eq(tables.id, id))
    .returning();
  return deletedTable;
}

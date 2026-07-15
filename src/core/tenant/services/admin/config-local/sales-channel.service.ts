import { salesChannels } from '@/db/tenant/schema';
import { eq, asc } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

/**
 * Obtener todos los canales de venta del tenant
 */
export async function getAllSalesChannels() {
  const db = getTenantDb();
  return db.select().from(salesChannels).orderBy(asc(salesChannels.name));
}

/**
 * Obtener un canal de venta por ID
 */
export async function getSalesChannelById(id: number) {
  const db = getTenantDb();
  const [channel] = await db.select().from(salesChannels).where(eq(salesChannels.id, id));
  return channel;
}

/**
 * Crear un nuevo canal de venta
 */
export async function createSalesChannel(data: any) {
  const db = getTenantDb();

  const existing = await db.select({ id: salesChannels.id })
    .from(salesChannels)
    .where(eq(salesChannels.code, data.code));

  if (existing.length > 0) {
    throw new Error(`Ya existe un canal de venta con el código "${data.code}"`);
  }

  const [newChannel] = await db.insert(salesChannels).values({
    ...data,
  }).returning();
  return newChannel;
}

/**
 * Actualizar un canal de venta existente
 */
export async function updateSalesChannel(id: number, data: any) {
  const db = getTenantDb();

  if (data.code) {
    const existing = await db.select({ id: salesChannels.id })
      .from(salesChannels)
      .where(eq(salesChannels.code, data.code));

    if (existing.length > 0 && existing[0].id !== id) {
      throw new Error(`Ya existe un canal de venta con el código "${data.code}"`);
    }
  }

  const [updated] = await db
    .update(salesChannels)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(salesChannels.id, id))
    .returning();
  return updated;
}

/**
 * Eliminar un canal de venta
 */
export async function deleteSalesChannel(id: number) {
  const db = getTenantDb();
  const [deleted] = await db
    .delete(salesChannels)
    .where(eq(salesChannels.id, id))
    .returning();
  return deleted;
}

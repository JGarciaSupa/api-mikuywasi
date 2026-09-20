import { salesChannels, orders, orderItems } from '@/db/tenant/schema';
import { eq, asc, or, isNull, count } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import { InUseError } from '@/utils/errors';

/**
 * Obtener todos los canales de venta del tenant.
 * Si se pasa branchId, filtra a los canales propios de esa sucursal más los globales (branch_id null).
 */
export async function getAllSalesChannels(branchId?: number) {
  const db = getTenantDb();

  if (branchId !== undefined) {
    return db.select().from(salesChannels)
      .where(or(eq(salesChannels.branchId, branchId), isNull(salesChannels.branchId)))
      .orderBy(asc(salesChannels.name));
  }

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
export async function deleteSalesChannel(id: number, force = false) {
  const db = getTenantDb();

  const [existing] = await db.select({ id: salesChannels.id }).from(salesChannels).where(eq(salesChannels.id, id));
  if (!existing) throw new Error('Canal de venta no encontrado');

  const [{ refs: orderRefs }] = await db.select({ refs: count() }).from(orders).where(eq(orders.salesChannelId, id));
  const [{ refs: itemRefs }] = await db.select({ refs: count() }).from(orderItems).where(eq(orderItems.salesChannelId, id));
  const refs = orderRefs + itemRefs;

  if (refs > 0 && !force) {
    throw new InUseError(
      `Este canal de venta está asociado a ${refs} registro(s) de pedidos. Si lo eliminas, esos pedidos conservarán el nombre del canal pero perderán el vínculo. ¿Deseas eliminarlo de todas formas?`,
      refs,
    );
  }

  if (orderRefs > 0) await db.update(orders).set({ salesChannelId: null }).where(eq(orders.salesChannelId, id));
  if (itemRefs > 0) await db.update(orderItems).set({ salesChannelId: null }).where(eq(orderItems.salesChannelId, id));

  const [deleted] = await db.delete(salesChannels).where(eq(salesChannels.id, id)).returning();
  return deleted;
}

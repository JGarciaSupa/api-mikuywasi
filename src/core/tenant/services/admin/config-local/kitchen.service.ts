import { orders, orderItems, orderStationConfirmations } from '@/db/tenant/schema';
import { eq, asc, inArray, and, isNull } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import { resolveEffectiveStations } from './kitchen-station.service';

/**
 * Estaciones reales (no cuenta "sin asignar") que toca un pedido, según sus ítems.
 */
async function getRequiredStationsForOrder(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return new Set<number>();

  const items = await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is number => id != null))];
  if (productIds.length === 0) return new Set<number>();

  const resolved = await resolveEffectiveStations(db, productIds, order.branchId);
  const requiredStations = new Set<number>();
  for (const stationIds of resolved.values()) {
    stationIds.forEach((id) => requiredStations.add(id));
  }
  return requiredStations;
}

/**
 * Obtener órdenes activas para la cocina
 * Incluye estados: pending, confirmed, preparing
 *
 * Cada ítem incluye `stationIds`: a qué estaciones de cocina (SIGG 2.7) se enruta
 * su producto. Array vacío = producto sin estación asignada todavía (fail-open:
 * el frontend debe mostrarlo en todas las estaciones con una advertencia, nunca
 * ocultarlo por completo).
 */
export const getActiveKitchenOrders = async (branchId: number) => {
  const db = getTenantDb();

  const activeOrders = await db
    .select()
    .from(orders)
    .where(and(inArray(orders.status, ['confirmed', 'preparing']), eq(orders.branchId, branchId)))
    .orderBy(asc(orders.createdAt));

  if (activeOrders.length === 0) return [];

  const orderIds = activeOrders.map(o => o.id);

  const allItems = await db
    .select()
    .from(orderItems)
    .where(and(inArray(orderItems.orderId, orderIds), isNull(orderItems.deletedAt)));

  const productIds = [...new Set(allItems.map((i) => i.productId).filter((id): id is number => id != null))];

  const stationsByProduct = await resolveEffectiveStations(db, productIds, branchId);

  const confirmations = await db
    .select()
    .from(orderStationConfirmations)
    .where(inArray(orderStationConfirmations.orderId, orderIds));

  const confirmedByOrder = new Map<string, number[]>();
  for (const c of confirmations) {
    const list = confirmedByOrder.get(c.orderId) ?? [];
    list.push(c.stationId);
    confirmedByOrder.set(c.orderId, list);
  }

  return activeOrders.map(order => ({
    ...order,
    confirmedStationIds: confirmedByOrder.get(order.id) ?? [],
    items: allItems
      .filter(item => item.orderId === order.id)
      .map((item) => ({
        ...item,
        stationIds: item.productId ? (stationsByProduct.get(item.productId) ?? []) : [],
      })),
  }));
};

/**
 * Una estación confirma que su parte del pedido está lista. El pedido completo
 * solo pasa a `ready_for_pickup` cuando TODAS las estaciones reales que toca ya
 * confirmaron — evita que una estación cierre por error el trabajo de otra.
 */
export const confirmStationForOrder = async (orderId: string, stationId: number) => {
  const db = getTenantDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');

  await db.insert(orderStationConfirmations).values({ orderId, stationId }).onConflictDoNothing();

  const requiredStations = await getRequiredStationsForOrder(db, orderId);

  const confirmations = await db
    .select()
    .from(orderStationConfirmations)
    .where(eq(orderStationConfirmations.orderId, orderId));
  const confirmedStationIds = confirmations.map((c) => c.stationId);
  const confirmedSet = new Set(confirmedStationIds);

  const allConfirmed = [...requiredStations].every((s) => confirmedSet.has(s));

  if (allConfirmed) {
    const [updated] = await db
      .update(orders)
      .set({ status: 'ready_for_pickup', updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return { order: updated, confirmedStationIds, allConfirmed: true };
  }

  return { order, confirmedStationIds, allConfirmed: false };
};

/**
 * Actualizar estado de una orden desde la cocina
 */
export const updateKitchenOrderStatus = async (id: string, status: 'preparing' | 'ready_for_pickup' | 'completed') => {
  const db = getTenantDb();
  const [updated] = await db
    .update(orders)
    .set({
      status: status,
      updatedAt: new Date()
    })
    .where(eq(orders.id, id))
    .returning();

  return updated;
};

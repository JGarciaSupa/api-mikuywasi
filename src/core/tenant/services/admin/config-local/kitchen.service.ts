import { orders, orderItems } from '@/db/tenant/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

/**
 * Obtener órdenes activas para la cocina
 * Incluye estados: pending, confirmed, preparing
 */
export const getActiveKitchenOrders = async () => {
  const db = getTenantDb();
  const activeOrders = await db
    .select()
    .from(orders)
    .where(inArray(orders.status, ['confirmed', 'preparing']))
    .orderBy(asc(orders.createdAt));

  if (activeOrders.length === 0) return [];

  const orderIds = activeOrders.map(o => o.id);

  const allItems = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  return activeOrders.map(order => ({
    ...order,
    items: allItems.filter(item => item.orderId === order.id)
  }));
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

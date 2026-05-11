import { db } from '../../db';
import { orders, orderItems } from '../../db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';

/**
 * Obtener órdenes activas para la cocina
 * Incluye estados: pending, confirmed, preparing
 */
export const getActiveKitchenOrders = async (tenantId: number) => {
  const activeOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.status, 'confirmed')
      )
    )
    .orderBy(asc(orders.createdAt));

  if (activeOrders.length === 0) return [];

  // Obtener items para todas las órdenes encontradas
  const orderIds = activeOrders.map(o => o.id);
  
  const allItems = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  // Agrupar items por orden
  return activeOrders.map(order => ({
    ...order,
    items: allItems.filter(item => item.orderId === order.id)
  }));
};

/**
 * Actualizar estado de una orden desde la cocina
 */
export const updateKitchenOrderStatus = async (id: string, tenantId: number, status: 'preparing' | 'ready_for_pickup' | 'completed') => {
  const [updated] = await db
    .update(orders)
    .set({ 
      status: status as any,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(orders.id, id), 
        eq(orders.tenantId, tenantId)
      )
    )
    .returning();

  return updated;
};

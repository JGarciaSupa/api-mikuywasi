import { orders, orderItems, orderItemExtras, productExtras, orderItemProperties } from '@/db/tenant/schema';
import { eq, asc, inArray, and } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

/**
 * Obtener órdenes activas para la cocina
 * Incluye estados: pending, confirmed, preparing
 */
export const getActiveKitchenOrders = async (branchId?: number) => {
  const db = getTenantDb();
  
  const conditions = [inArray(orders.status, ['confirmed', 'preparing'])];
  if (branchId) {
    conditions.push(eq(orders.branchId, branchId));
  }

  const activeOrders = await db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(asc(orders.createdAt));

  if (activeOrders.length === 0) return [];

  const orderIds = activeOrders.map(o => o.id);

  const allItems = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  const itemIds = allItems.map((i) => i.id);

  const extrasRows = itemIds.length
    ? await db
        .select({
          id: orderItemExtras.id,
          orderItemId: orderItemExtras.orderItemId,
          extraId: orderItemExtras.extraId,
          extraName: productExtras.name,
          qty: orderItemExtras.qty,
        })
        .from(orderItemExtras)
        .leftJoin(productExtras, eq(orderItemExtras.extraId, productExtras.id))
        .where(inArray(orderItemExtras.orderItemId, itemIds))
    : [];

  const propertiesRows = itemIds.length
    ? await db
        .select({
          id: orderItemProperties.id,
          orderItemId: orderItemProperties.orderItemId,
          propertyId: orderItemProperties.propertyId,
          propertyName: orderItemProperties.propertyName,
        })
        .from(orderItemProperties)
        .where(inArray(orderItemProperties.orderItemId, itemIds))
    : [];

  return activeOrders.map(order => ({
    ...order,
    items: allItems
      .filter(item => item.orderId === order.id)
      .map((item) => ({
        ...item,
        extras: extrasRows.filter((e) => e.orderItemId === item.id),
        properties: propertiesRows.filter((p) => p.orderItemId === item.id),
      })),
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

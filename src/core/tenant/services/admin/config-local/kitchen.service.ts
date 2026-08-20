import { orders, orderItems, orderStationConfirmations } from '@/db/tenant/schema';
import { eq, asc, inArray, and, sql } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import { resolveEffectiveStations } from './kitchen-station.service';

/**
 * Pedido + sus ítems, cada uno con `stationIds` resuelto (excepción de producto >
 * categoría > sin asignar). Centralizado acá porque tanto `getActiveKitchenOrders`
 * como toda la escritura de avance (`finalizeOrder` y sus llamantes) necesitan la
 * misma resolución y ya hubo un caso real donde cálculos duplicados divergían.
 */
async function getOrderItemsWithStations(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is number => id != null))];
  const stationsByProduct = productIds.length
    ? await resolveEffectiveStations(db, productIds, order.branchId)
    : new Map<number, number[]>();

  return {
    order,
    items: items.map((item) => ({
      ...item,
      stationIds: item.productId ? (stationsByProduct.get(item.productId) ?? []) : [],
    })),
  };
}

/**
 * Se corre después de tocar `order_items.preparedQty`: reconcilia qué estaciones
 * quedan confirmadas (todas sus líneas asignadas ya en preparedQty >= quantity) o
 * dejan de estarlo (si alguien deshizo una línea de una estación ya confirmada), y
 * si TODAS las estaciones requeridas están confirmadas, pasa el pedido a
 * `ready_for_pickup`. Así, marcar el último ítem de una estación (uno por uno)
 * tiene el mismo efecto que tocar "MARCAR RESTANTES" — el frontend no muestra botón
 * cuando no queda nada pendiente, así que la confirmación tiene que ser automática.
 */
async function finalizeOrder(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const { order, items } = await getOrderItemsWithStations(db, orderId);
  const requiredStations = new Set(items.flatMap((i) => i.stationIds));

  const existing = await db
    .select()
    .from(orderStationConfirmations)
    .where(eq(orderStationConfirmations.orderId, orderId));
  const confirmedSet = new Set(existing.map((c) => c.stationId));

  const toAdd: number[] = [];
  const toRemove: number[] = [];
  for (const stationId of requiredStations) {
    const stationItems = items.filter((i) => i.stationIds.includes(stationId));
    const isReady = stationItems.every((i) => i.preparedQty >= i.quantity);
    const isConfirmed = confirmedSet.has(stationId);
    if (isReady && !isConfirmed) toAdd.push(stationId);
    if (!isReady && isConfirmed) toRemove.push(stationId);
  }

  if (toAdd.length > 0) {
    await db
      .insert(orderStationConfirmations)
      .values(toAdd.map((stationId) => ({ orderId, stationId })))
      .onConflictDoNothing();
  }
  if (toRemove.length > 0) {
    await db
      .delete(orderStationConfirmations)
      .where(and(eq(orderStationConfirmations.orderId, orderId), inArray(orderStationConfirmations.stationId, toRemove)));
  }

  const confirmedStationIds = [...requiredStations].filter(
    (s) => !toRemove.includes(s) && (confirmedSet.has(s) || toAdd.includes(s)),
  );
  const allConfirmed = confirmedStationIds.length === requiredStations.size;

  let finalOrder = order;
  if (allConfirmed && order.status !== 'ready_for_pickup') {
    [finalOrder] = await db
      .update(orders)
      .set({ status: 'ready_for_pickup', updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
  }

  return {
    order: finalOrder,
    items: items.map((i) => ({ id: i.id, quantity: i.quantity, preparedQty: i.preparedQty, preparedAt: i.preparedAt })),
    confirmedStationIds,
    allConfirmed,
  };
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
    .where(inArray(orderItems.orderId, orderIds));

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
 * Una estación confirma que su parte del pedido está lista: marca listas todas sus
 * líneas asignadas y reconcilia el resto vía `finalizeOrder`. El pedido completo
 * solo pasa a `ready_for_pickup` cuando TODAS las estaciones reales que toca ya
 * quedaron confirmadas — evita que una estación cierre por error el trabajo de otra.
 */
export const confirmStationForOrder = async (orderId: string, stationId: number, userId?: number) => {
  const db = getTenantDb();
  const { items } = await getOrderItemsWithStations(db, orderId);

  const stationItemIds = items.filter((i) => i.stationIds.includes(stationId)).map((i) => i.id);
  if (stationItemIds.length === 0) {
    throw new Error('Esta estación no tiene ítems en este pedido');
  }

  await db
    .update(orderItems)
    .set({ preparedQty: sql`${orderItems.quantity}`, preparedAt: new Date(), preparedById: userId ?? null })
    .where(inArray(orderItems.id, stationItemIds));

  return finalizeOrder(db, orderId);
};

/**
 * Marca o deshace el avance de UNA línea. `qty` omitido = línea completa;
 * `qty: 0` = deshacer. Tras el cambio reconcilia estaciones/pedido por si esta
 * línea era la última pendiente (ver `finalizeOrder`).
 */
export const setItemPrepared = async (orderId: string, itemId: number, qty?: number, userId?: number) => {
  const db = getTenantDb();

  const [item] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));
  if (!item) throw new Error('Ítem no encontrado en este pedido');

  const targetQty = qty === undefined ? item.quantity : qty;
  if (!Number.isInteger(targetQty) || targetQty < 0 || targetQty > item.quantity) {
    throw new Error('Cantidad preparada inválida');
  }

  const ready = targetQty >= item.quantity;
  await db
    .update(orderItems)
    .set({ preparedQty: targetQty, preparedAt: ready ? new Date() : null, preparedById: ready ? (userId ?? null) : null })
    .where(eq(orderItems.id, itemId));

  return finalizeOrder(db, orderId);
};

/**
 * Marca listas todas las líneas del pedido de una sola vez (atajo cuando no hace
 * falta ir línea por línea, o vista de supervisor sobre un pedido multi-estación).
 */
export const markOrderPrepared = async (orderId: string, userId?: number) => {
  const db = getTenantDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');

  await db
    .update(orderItems)
    .set({ preparedQty: sql`${orderItems.quantity}`, preparedAt: new Date(), preparedById: userId ?? null })
    .where(eq(orderItems.orderId, orderId));

  return finalizeOrder(db, orderId);
};

/**
 * Devuelve a la cola un pedido que había quedado `ready_for_pickup` por error:
 * limpia confirmaciones de estación y avance de líneas, y lo regresa a `preparing`.
 */
export const recallOrder = async (orderId: string) => {
  const db = getTenantDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (order.status !== 'ready_for_pickup') {
    throw new Error('El pedido no está listo para devolver a la cola');
  }

  await db.delete(orderStationConfirmations).where(eq(orderStationConfirmations.orderId, orderId));
  await db
    .update(orderItems)
    .set({ preparedQty: 0, preparedAt: null, preparedById: null })
    .where(eq(orderItems.orderId, orderId));

  const [updated] = await db
    .update(orders)
    .set({ status: 'preparing', updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  return updated;
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

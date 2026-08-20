import { orders, orderItems, orderStationConfirmations, orderItemExtras, productExtras } from '@/db/tenant/schema';
import { eq, asc, inArray, and, isNull } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import { resolveEffectiveStations } from './kitchen-station.service';

type Db = ReturnType<typeof getTenantDb>;

/** Estados en los que un pedido ya no admite cambios desde cocina. */
const CLOSED_STATUSES = ['cancelled', 'completed'];

/**
 * Recalcula, a partir de los ítems, qué estaciones terminaron su parte y en qué estado
 * queda el pedido. Es la ÚNICA función que escribe `order_station_confirmations` y el
 * status de cocina: así el avance por ítem es la fuente de verdad y todo lo demás se
 * deriva de él.
 *
 * Consecuencia buscada: si el mozo agrega un plato a un pedido ya listo, la estación
 * deja de estar completa sola y el pedido vuelve a la cola — antes la fila de
 * confirmación quedaba puesta para siempre y el plato nuevo no lo veía nadie.
 */
async function syncOrderPreparation(db: Db, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));

  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is number => id != null))];
  const stationsByProduct = productIds.length
    ? await resolveEffectiveStations(db, productIds, order.branchId)
    : new Map<number, number[]>();

  const stationsOf = (item: (typeof items)[number]) =>
    item.productId ? (stationsByProduct.get(item.productId) ?? []) : [];
  const isReady = (item: (typeof items)[number]) => item.preparedQty >= item.quantity;

  const requiredStations = new Set<number>();
  for (const item of items) stationsOf(item).forEach((id) => requiredStations.add(id));

  // Una estación está completa cuando terminó TODO lo que ve en pantalla: sus ítems
  // más los que no tienen estación asignada (fail-open — esos se muestran en todas).
  const completeStations = [...requiredStations].filter((stationId) =>
    items
      .filter((i) => {
        const s = stationsOf(i);
        return s.length === 0 || s.includes(stationId);
      })
      .every(isReady),
  );

  const existing = await db
    .select()
    .from(orderStationConfirmations)
    .where(eq(orderStationConfirmations.orderId, orderId));
  const existingIds = new Set(existing.map((c) => c.stationId));
  const completeSet = new Set(completeStations);

  const toInsert = completeStations.filter((id) => !existingIds.has(id));
  if (toInsert.length) {
    await db
      .insert(orderStationConfirmations)
      .values(toInsert.map((stationId) => ({ orderId, stationId })))
      .onConflictDoNothing();
  }

  const toDelete = [...existingIds].filter((id) => !completeSet.has(id));
  if (toDelete.length) {
    await db
      .delete(orderStationConfirmations)
      .where(
        and(
          eq(orderStationConfirmations.orderId, orderId),
          inArray(orderStationConfirmations.stationId, toDelete),
        ),
      );
  }

  // `items.length > 0` evita que un pedido al que le anularon todas las líneas se
  // marque listo por vacuidad.
  const allReady = items.length > 0 && items.every(isReady);
  const anyReady = items.some((i) => i.preparedQty > 0);

  let status = order.status;
  if (allReady && (status === 'confirmed' || status === 'preparing')) status = 'ready_for_pickup';
  else if (!allReady && status === 'ready_for_pickup') status = 'preparing';
  else if (anyReady && status === 'confirmed') status = 'preparing';

  let finalOrder = order;
  if (status !== order.status) {
    const [updated] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    finalOrder = updated;
  }

  return {
    order: finalOrder,
    items: items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      preparedQty: i.preparedQty,
      preparedAt: i.preparedAt,
    })),
    confirmedStationIds: completeStations,
    allConfirmed: allReady,
  };
}

/** Carga el pedido y rechaza si ya está cerrado (anulado o terminado). */
async function loadOpenOrder(db: Db, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (CLOSED_STATUSES.includes(order.status)) {
    const label = order.status === 'cancelled' ? 'anulado' : 'cerrado';
    throw new Error('El pedido está ' + label + ' y ya no admite cambios desde cocina');
  }
  return order;
}

/** Marca listas las líneas indicadas y devuelve cuántas cambiaron. */
async function markItemsReady(db: Db, items: { id: number; quantity: number; preparedQty: number; preparedAt: Date | null; preparedById: number | null }[], userId?: number) {
  const now = new Date();
  const pending = items.filter((i) => i.preparedQty < i.quantity);
  for (const item of pending) {
    await db
      .update(orderItems)
      .set({
        preparedQty: item.quantity,
        preparedAt: item.preparedAt ?? now,
        preparedById: userId ?? item.preparedById,
      })
      .where(eq(orderItems.id, item.id));
  }
  return pending.length;
}

/**
 * Obtener órdenes activas para la cocina (estados `confirmed` y `preparing`).
 *
 * Cada ítem incluye:
 * - `stationIds`: a qué estaciones de cocina (SIGG 2.7) se enruta su producto. Array
 *   vacío = producto sin estación asignada todavía (fail-open: el frontend lo muestra
 *   en todas las estaciones con una advertencia, nunca lo oculta).
 * - `extras`: los extras elegidos en esa línea. Sin esto el cocinero prepara el plato
 *   sin enterarse de que lleva "+ queso extra".
 * - `preparedQty` / `preparedAt`: avance de preparación de la línea.
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

  const itemIds = allItems.map((i) => i.id);
  const extrasRows = itemIds.length
    ? await db
        .select({
          orderItemId: orderItemExtras.orderItemId,
          extraId: orderItemExtras.extraId,
          extraName: productExtras.name,
          qty: orderItemExtras.qty,
        })
        .from(orderItemExtras)
        .leftJoin(productExtras, eq(orderItemExtras.extraId, productExtras.id))
        .where(inArray(orderItemExtras.orderItemId, itemIds))
    : [];

  const extrasByItem = new Map<number, typeof extrasRows>();
  for (const row of extrasRows) {
    const list = extrasByItem.get(row.orderItemId) ?? [];
    list.push(row);
    extrasByItem.set(row.orderItemId, list);
  }

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
        extras: extrasByItem.get(item.id) ?? [],
      })),
  }));
};

/**
 * Marca (o desmarca) cuánto de una línea terminó cocina. `qty` se recorta al rango
 * [0, quantity]; `qty = 0` es el "deshacer" de esa línea.
 */
export const setItemPreparedQty = async (
  orderId: string,
  itemId: number,
  qty: number,
  userId?: number,
) => {
  const db = getTenantDb();
  await loadOpenOrder(db, orderId);

  const [item] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
  if (!item) throw new Error('Ítem no encontrado en el pedido');

  const next = Math.max(0, Math.min(Math.trunc(qty), item.quantity));

  await db
    .update(orderItems)
    .set({
      preparedQty: next,
      // La hora se sella solo cuando la línea queda completa; si se deshace, vuelve a NULL.
      preparedAt: next >= item.quantity ? (item.preparedAt ?? new Date()) : null,
      preparedById: next > 0 ? (userId ?? item.preparedById) : null,
    })
    .where(eq(orderItems.id, itemId));

  return syncOrderPreparation(db, orderId);
};

/** Marca listas todas las líneas del pedido (pedido de una sola estación). */
export const markOrderPrepared = async (orderId: string, userId?: number) => {
  const db = getTenantDb();
  await loadOpenOrder(db, orderId);

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));

  await markItemsReady(db, items, userId);

  return syncOrderPreparation(db, orderId);
};

/**
 * Una estación confirma que su parte está lista: marca listas todas las líneas que esa
 * estación ve (las suyas + las sin asignar) y deja que `syncOrderPreparation` decida si
 * el pedido completo ya puede pasar a listo.
 */
export const confirmStationForOrder = async (orderId: string, stationId: number, userId?: number) => {
  const db = getTenantDb();
  const order = await loadOpenOrder(db, orderId);

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));

  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is number => id != null))];
  const stationsByProduct = productIds.length
    ? await resolveEffectiveStations(db, productIds, order.branchId)
    : new Map<number, number[]>();

  const mine = items.filter((item) => {
    const s = item.productId ? (stationsByProduct.get(item.productId) ?? []) : [];
    return s.length === 0 || s.includes(stationId);
  });

  await markItemsReady(db, mine, userId);

  return syncOrderPreparation(db, orderId);
};

/**
 * Devuelve un pedido ya marcado listo a la cola de cocina (recall). Limpia el avance de
 * todas sus líneas — el caso real es el toque accidental en la tablet.
 */
export const recallOrder = async (orderId: string) => {
  const db = getTenantDb();
  const order = await loadOpenOrder(db, orderId);

  if (!['ready_for_pickup', 'preparing', 'confirmed'].includes(order.status)) {
    throw new Error('El pedido ya salió de cocina y no se puede devolver a la cola');
  }

  await db
    .update(orderItems)
    .set({ preparedQty: 0, preparedAt: null, preparedById: null })
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));

  await db.delete(orderStationConfirmations).where(eq(orderStationConfirmations.orderId, orderId));

  await db
    .update(orders)
    .set({ status: 'preparing', updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  return syncOrderPreparation(db, orderId);
};

/**
 * Actualizar estado de una orden desde la cocina. Valida contra el estado actual: una
 * tablet con una card vieja en pantalla no debe poder pisar un pedido ya anulado.
 */
export const updateKitchenOrderStatus = async (
  id: string,
  status: 'preparing' | 'ready_for_pickup' | 'completed',
) => {
  const db = getTenantDb();
  await loadOpenOrder(db, id);

  // "Listo" pasa siempre por el avance de ítems, para que no queden líneas pendientes
  // debajo de un pedido marcado como terminado.
  if (status === 'ready_for_pickup') return markOrderPrepared(id);

  const [updated] = await db
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();

  return { order: updated, items: [], confirmedStationIds: [], allConfirmed: false };
};

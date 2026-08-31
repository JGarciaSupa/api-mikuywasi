import { orders, orderItems, kitchenStations, printers, orderItemExtras, productExtras, users, branches } from '@/db/tenant/schema';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import { resolveEffectiveStations } from '../config-local/kitchen-station.service';

export async function getOrderDispatchPayload(orderId: string, branchId: number) {
  const db = getTenantDb();

  const [order] = await db
    .select({
      id: orders.id,
      branchId: orders.branchId,
      tableName: orders.tableName,
      customerName: orders.customerName,
      deliveryType: orders.deliveryType,
      notes: orders.notes,
      waiterId: orders.waiterId,
      salesChannelName: orders.salesChannelName,
      createdAt: orders.createdAt,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.id, orderId));

  if (!order) {
    throw new Error('Pedido no encontrado');
  }

  let waiterName: string | null = null;
  if (order.waiterId) {
    const [waiter] = await db.select({ name: users.name }).from(users).where(eq(users.id, order.waiterId));
    if (waiter) waiterName = waiter.name;
  }

  // Get items that haven't been sent to kitchen
  const pendingItems = await db
    .select()
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.sentToKitchen, false),
        isNull(orderItems.deletedAt),
      )
    );

  if (pendingItems.length === 0) {
    return {
      order: { ...order, waiterName },
      pendingCount: 0,
      areas: [],
    };
  }

  const productIds = [...new Set(pendingItems.map((i) => i.productId).filter((id): id is number => id != null))];
  const stationsByProduct = await resolveEffectiveStations(db, productIds, branchId);

  const branchStations = await db
    .select({
      id: kitchenStations.id,
      name: kitchenStations.name,
      code: kitchenStations.code,
      printerId: kitchenStations.printerId,
    })
    .from(kitchenStations)
    .where(eq(kitchenStations.branchId, branchId));

  const stationMap = new Map(branchStations.map((s) => [s.id, s]));

  const branchPrinters = await db
    .select()
    .from(printers)
    .where(and(eq(printers.branchId, branchId), eq(printers.isActive, true)));

  const printerMap = new Map(branchPrinters.map((p) => [p.id, p]));
  const defaultPrinter = branchPrinters[0] || null;

  // Load extras for items
  const itemIds = pendingItems.map((i) => i.id);
  const extrasRows = itemIds.length
    ? await db
        .select({
          orderItemId: orderItemExtras.orderItemId,
          extraName: productExtras.name,
          qty: orderItemExtras.qty,
        })
        .from(orderItemExtras)
        .leftJoin(productExtras, eq(orderItemExtras.extraId, productExtras.id))
        .where(inArray(orderItemExtras.orderItemId, itemIds))
    : [];

  const extrasByItem = new Map<number, string[]>();
  for (const row of extrasRows) {
    const list = extrasByItem.get(row.orderItemId) ?? [];
    if (row.extraName) {
      list.push(`${row.qty > 1 ? row.qty + 'x ' : ''}${row.extraName}`);
    }
    extrasByItem.set(row.orderItemId, list);
  }

  // Group items by printer/station
  // Key: printerId (or 'unassigned')
  type AreaGroup = {
    stationId: number | null;
    stationName: string;
    printer: (typeof branchPrinters)[number] | null;
    items: Array<{
      id: number;
      productId: number | null;
      productName: string;
      quantity: number;
      notes: string | null;
      modifiers: string[];
      selectedAlternatives: { name: string; extraPrice: number }[];
    }>;
  };

  const areasMap = new Map<string, AreaGroup>();

  for (const item of pendingItems) {
    const sIds = item.productId ? (stationsByProduct.get(item.productId) ?? []) : [];
    const effectiveStationIds = sIds.length > 0 ? sIds : [null];

    const itemExtras = extrasByItem.get(item.id) ?? [];
    const alternativeNames = Array.isArray(item.selectedAlternatives)
      ? item.selectedAlternatives.map((a: any) => a.name).filter(Boolean)
      : [];

    const itemPayload = {
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      notes: item.notes,
      modifiers: [...itemExtras, ...alternativeNames],
      selectedAlternatives: item.selectedAlternatives || [],
    };

    for (const stationId of effectiveStationIds) {
      const station = stationId ? stationMap.get(stationId) : null;
      const printer = station?.printerId ? (printerMap.get(station.printerId) || null) : defaultPrinter;

      // Agrupar por ESTACIÓN para que cada área de preparación tenga su comanda independiente
      const groupKey = station ? `station_${station.id}_printer_${printer?.id || 'default'}` : `general_printer_${printer?.id || 'default'}`;

      let group = areasMap.get(groupKey);
      if (!group) {
        group = {
          stationId: station?.id || null,
          stationName: station?.name || 'Cocina General',
          printer: printer || null,
          items: [],
        };
        areasMap.set(groupKey, group);
      }

      group.items.push(itemPayload);
    }
  }

  return {
    order: { ...order, waiterName },
    pendingCount: pendingItems.length,
    areas: Array.from(areasMap.values()),
  };
}

export async function markOrderItemsDispatched(orderId: string, itemIds: number[]) {
  const db = getTenantDb();
  if (itemIds.length === 0) return { updatedCount: 0 };

  const now = new Date();

  await db
    .update(orderItems)
    .set({
      sentToKitchen: true,
      printedAt: now,
    })
    .where(
      and(
        eq(orderItems.orderId, orderId),
        inArray(orderItems.id, itemIds),
      )
    );

  // If order was pending, advance it to confirmed/preparing
  const [currentOrder] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  if (currentOrder && currentOrder.status === 'pending') {
    await db
      .update(orders)
      .set({ status: 'confirmed', updatedAt: now })
      .where(eq(orders.id, orderId));
  }

  return { updatedCount: itemIds.length, timestamp: now };
}

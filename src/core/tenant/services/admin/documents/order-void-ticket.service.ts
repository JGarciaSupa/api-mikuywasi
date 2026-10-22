import { orders, orderItems, ordersItemsDeleted, kitchenStations, printers, users, reasons } from '@/db/tenant/schema';
import { eq, and, desc, inArray, isNull } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import { resolveEffectiveStations } from '../config-local/kitchen-station.service';

// Datos para imprimir el ticket de ANULACIÓN en las áreas de cocina que ya recibieron
// la comanda. Solo lectura: no modifica el pedido ni los ítems.
//  - Con itemId: última anulación registrada de ese ítem (orders_items_deleted).
//  - Sin itemId: pedido cancelado completo (ítems enviados a cocina que seguían vigentes).
// Si nada de lo anulado llegó a cocina (sentToKitchen = false) devuelve areas = [].

type VoidTicketItem = {
  id: number;
  productName: string;
  shortName: string | null;
  quantity: number;
  notes: string | null;
};

export async function getOrderVoidTicketPayload(orderId: string, branchId: number, itemId?: number) {
  const db = getTenantDb();

  const [order] = await db
    .select({
      id: orders.id,
      trackingCode: orders.trackingCode,
      branchId: orders.branchId,
      tableName: orders.tableName,
      waiterId: orders.waiterId,
      salesChannelName: orders.salesChannelName,
      status: orders.status,
      reasonId: orders.reasonId,
      motivo: orders.motivo,
      deletedById: orders.deletedById,
      authorizedById: orders.authorizedById,
      deletedDate: orders.deletedDate,
    })
    .from(orders)
    .where(eq(orders.id, orderId));

  if (!order) throw new Error('Pedido no encontrado');
  if (order.branchId !== branchId) throw new Error('El pedido no pertenece a la sucursal');

  let items: Array<VoidTicketItem & { productId: number | null }> = [];
  let reasonId: number | null = null;
  let motivo: string | null = null;
  let deletedById: number | null = null;
  let authorizedById: number | null = null;
  let voidedAt: Date | null = null;
  let scope: 'item' | 'order';

  if (itemId != null) {
    scope = 'item';
    const [oi] = await db.select().from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));
    if (!oi) throw new Error('Ítem no encontrado en el pedido');

    const [ev] = await db.select().from(ordersItemsDeleted)
      .where(and(eq(ordersItemsDeleted.orderId, orderId), eq(ordersItemsDeleted.orderItemId, itemId)))
      .orderBy(desc(ordersItemsDeleted.id))
      .limit(1);
    if (!ev) throw new Error('El ítem no tiene anulaciones registradas');

    reasonId = ev.reasonId; motivo = ev.motivo;
    deletedById = ev.deletedById; authorizedById = ev.authorizedById;
    voidedAt = ev.createdAt;
    if (oi.sentToKitchen) {
      items = [{
        id: oi.id, productId: oi.productId, productName: oi.productName, shortName: oi.shortName ?? null,
        quantity: ev.quantity ?? oi.quantity, notes: oi.notes,
      }];
    }
  } else {
    scope = 'order';
    if (order.status !== 'cancelled') throw new Error('El pedido no está anulado');
    reasonId = order.reasonId; motivo = order.motivo;
    deletedById = order.deletedById; authorizedById = order.authorizedById;
    voidedAt = order.deletedDate;
    const rows = await db.select().from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.sentToKitchen, true), isNull(orderItems.deletedAt)));
    items = rows.map((oi) => ({
      id: oi.id, productId: oi.productId, productName: oi.productName, shortName: oi.shortName ?? null,
      quantity: oi.quantity, notes: oi.notes,
    }));
  }

  const userIds = [order.waiterId, deletedById, authorizedById].filter((v): v is number => v != null);
  const userRows = userIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
    : [];
  const userName = (id: number | null) => (id != null ? userRows.find((u) => u.id === id)?.name ?? null : null);

  let reasonText = motivo;
  if (reasonId != null) {
    const [r] = await db.select({ description: reasons.description }).from(reasons).where(eq(reasons.id, reasonId));
    if (r) reasonText = r.description;
  }

  // Misma agrupación por estación/impresora que el despacho de comandas
  const areas: Array<{ stationName: string; printer: (typeof printers.$inferSelect) | null; items: VoidTicketItem[] }> = [];
  if (items.length > 0) {
    const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is number => id != null))];
    const stationsByProduct = await resolveEffectiveStations(db, productIds, branchId);
    const branchStations = await db
      .select({ id: kitchenStations.id, name: kitchenStations.name, printerId: kitchenStations.printerId })
      .from(kitchenStations)
      .where(eq(kitchenStations.branchId, branchId));
    const stationMap = new Map(branchStations.map((s) => [s.id, s]));
    const branchPrinters = await db.select().from(printers)
      .where(and(eq(printers.branchId, branchId), eq(printers.isActive, true)));
    const printerMap = new Map(branchPrinters.map((p) => [p.id, p]));
    const defaultPrinter = branchPrinters[0] || null;

    const byKey = new Map<string, (typeof areas)[number]>();
    for (const { productId, ...item } of items) {
      const sIds = productId ? (stationsByProduct.get(productId) ?? []) : [];
      for (const stationId of (sIds.length > 0 ? sIds : [null])) {
        const station = stationId ? stationMap.get(stationId) : null;
        const printer = station?.printerId ? (printerMap.get(station.printerId) || null) : defaultPrinter;
        const key = station ? `station_${station.id}_printer_${printer?.id || 'default'}` : `general_printer_${printer?.id || 'default'}`;
        let group = byKey.get(key);
        if (!group) {
          group = { stationName: station?.name || 'Cocina General', printer, items: [] };
          byKey.set(key, group);
        }
        group.items.push(item);
      }
    }
    areas.push(...byKey.values());
  }

  return {
    scope,
    order: {
      id: order.id,
      trackingCode: order.trackingCode,
      tableName: order.tableName,
      salesChannelName: order.salesChannelName,
      waiterName: userName(order.waiterId),
    },
    reason: reasonText,
    deletedByName: userName(deletedById),
    authorizedByName: userName(authorizedById),
    voidedAt,
    areas,
  };
}

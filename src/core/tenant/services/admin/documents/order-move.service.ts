import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  orders,
  orderItems,
  orderItemExtras,
  orderSplits,
  tables,
  billingDocuments,
} from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { getActiveSessionForUser } from './cash.service';
import { resolveForRegister } from '../config-local/activation.service';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import { reverseDischargeForOrder, autoDischargeOnOrderCreated } from '../warehouse/sales-discharge.service';

const ENABLE_TABLE_MOVE = 'ENABLE_TABLE_MOVE';
const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'dispatched'] as const;
const EDITABLE_STATUSES = ['pending', 'confirmed', 'preparing'];

const toNum = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const round = (v: number) => Number(v.toFixed(2));

type TaxSnap = { key: string; label: string; sunatCode?: string; rate: number; calculationType?: string; defaultActive?: boolean; isActive: boolean; amount?: number };

export interface MoveItemInput { orderItemId: number; quantity: number }
export interface MoveOrderInput {
  orderId: string;
  targetTableId: number;
  items?: MoveItemInput[]; // ausente/vacío = mover TODO el pedido
  userId: number;
  ip?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Pedido activo (dine_in, no terminal, más reciente) de una mesa, o null.
async function getActiveOrderForTable(
  db: ReturnType<typeof getTenantDb>,
  tableId: number,
  branchId: number,
) {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(
      eq(orders.tableId, tableId),
      eq(orders.branchId, branchId),
      eq(orders.deliveryType, 'dine_in'),
      inArray(orders.status, [...ACTIVE_STATUSES]),
    ))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row ?? null;
}

// Bloquea el movimiento si el pedido ya tiene un comprobante emitido.
async function assertNoBilling(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const docs = await db.select({ id: billingDocuments.id }).from(billingDocuments).where(eq(billingDocuments.orderId, orderId));
  if (docs.length > 0) {
    throw new Error('El pedido ya tiene un comprobante emitido; no se puede mover');
  }
}

// Recalcula subtotal/retención/total del pedido (mismo criterio que waiter-order.recalcOrderTotals).
async function recalcTotals(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const ois = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const subtotal = ois.reduce((s, i) => s + toNum(i.totalPrice), 0);
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  const deliveryFee = toNum(order?.deliveryFee ?? '0');
  const splits = await db.select({ retentionAmount: orderSplits.retentionAmount }).from(orderSplits).where(eq(orderSplits.orderId, orderId));
  const retentionAmount = splits.length > 0
    ? round(splits.reduce((sum, s) => sum + toNum(s.retentionAmount), 0))
    : round(((subtotal + deliveryFee) * toNum(order?.retentionPercentage ?? '0')) / 100);
  const total = round(subtotal + deliveryFee + retentionAmount);

  // Re-agrega taxBreakdown desde los taxSnapshot de los ítems (recalcOrderTotals no lo hace).
  const taxMap = new Map<string, TaxSnap>();
  for (const it of ois) {
    for (const t of (it.taxSnapshot as TaxSnap[] | null) ?? []) {
      const prev = taxMap.get(t.key);
      if (prev) prev.amount = round(toNum(prev.amount) + toNum(t.amount));
      else taxMap.set(t.key, { ...t, amount: round(toNum(t.amount)) });
    }
  }
  const taxBreakdown = taxMap.size > 0 ? Array.from(taxMap.values()) : null;

  await db.update(orders).set({
    subtotal: String(round(subtotal)),
    retentionAmount: String(retentionAmount),
    total: String(total),
    taxBreakdown: taxBreakdown as any,
    updatedAt: new Date(),
  }).where(eq(orders.id, orderId));
}

// Prorratea los montos del taxSnapshot por una razón (movedQty/originalQty).
function prorateTax(snapshot: TaxSnap[] | null, ratio: number): TaxSnap[] | null {
  if (!snapshot) return null;
  return snapshot.map((t) => ({ ...t, amount: round(toNum(t.amount) * ratio) }));
}

// Genera un trackingCode único (año + secuencia), mismo criterio que createOrder.
async function genTrackingCode(db: ReturnType<typeof getTenantDb>): Promise<string> {
  const year = String(new Date().getFullYear());
  const [row] = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${orders.trackingCode} FROM 5) AS INTEGER)), 0)` })
    .from(orders)
    .where(sql`${orders.trackingCode} ~ ${`^${year}[0-9]+$`}`);
  const nextSeq = Number(row?.maxSeq ?? 0) + 1;
  return `${year}${String(nextSeq).padStart(4, '0')}`;
}

// Mueve ítems (total o parcial) del pedido origen al destino, clonando la fila completa
// (impuestos/costo/extras) y prorrateando cuando es cantidad parcial.
async function moveItems(
  db: ReturnType<typeof getTenantDb>,
  sourceOrderId: string,
  targetOrderId: string,
  moves: MoveItemInput[],
) {
  for (const mv of moves) {
    const [item] = await db.select().from(orderItems)
      .where(and(eq(orderItems.id, mv.orderItemId), eq(orderItems.orderId, sourceOrderId)));
    if (!item) throw new Error(`El ítem ${mv.orderItemId} no pertenece al pedido`);

    const moveQty = Math.min(Math.max(1, Math.floor(mv.quantity)), item.quantity);
    const full = moveQty >= item.quantity;
    const perUnit = item.quantity > 0 ? toNum(item.totalPrice) / item.quantity : 0;
    const movedTotal = round(perUnit * moveQty);
    const ratio = item.quantity > 0 ? moveQty / item.quantity : 1;

    const [newItem] = await db.insert(orderItems).values({
      orderId: targetOrderId,
      splitId: null,
      productId: item.productId,
      salesChannelId: item.salesChannelId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: moveQty,
      selectedAlternatives: item.selectedAlternatives,
      packagingFee: item.packagingFee,
      notes: item.notes,
      totalPrice: String(movedTotal),
      unitCost: item.unitCost,
      taxSnapshot: prorateTax(item.taxSnapshot as TaxSnap[] | null, ratio) as any,
    }).returning();

    const extras = await db.select().from(orderItemExtras).where(eq(orderItemExtras.orderItemId, item.id));

    if (full) {
      // Reasigna los extras al ítem nuevo y elimina el ítem origen.
      if (extras.length) {
        await db.update(orderItemExtras).set({ orderItemId: newItem.id }).where(eq(orderItemExtras.orderItemId, item.id));
      }
      await db.delete(orderItems).where(eq(orderItems.id, item.id));
    } else {
      // Clona extras prorrateados al ítem nuevo y reduce el ítem origen.
      for (const ex of extras) {
        const movedExQty = Math.max(1, Math.round(ex.qty * ratio));
        const movedExTotal = round(toNum(ex.unitPrice) * movedExQty);
        await db.insert(orderItemExtras).values({
          orderItemId: newItem.id,
          extraId: ex.extraId,
          qty: movedExQty,
          unitPrice: ex.unitPrice,
          totalPrice: String(movedExTotal),
        });
        const remExQty = ex.qty - movedExQty;
        if (remExQty > 0) {
          await db.update(orderItemExtras).set({ qty: remExQty, totalPrice: String(round(toNum(ex.unitPrice) * remExQty)) }).where(eq(orderItemExtras.id, ex.id));
        } else {
          await db.delete(orderItemExtras).where(eq(orderItemExtras.id, ex.id));
        }
      }
      const remQty = item.quantity - moveQty;
      await db.update(orderItems).set({
        quantity: remQty,
        totalPrice: String(round(toNum(item.totalPrice) - movedTotal)),
        taxSnapshot: prorateTax(item.taxSnapshot as TaxSnap[] | null, remQty / item.quantity) as any,
      }).where(eq(orderItems.id, item.id));
    }
  }
}

// Reconstruye la descarga de stock de un pedido (revierte y vuelve a procesar), para que
// el costo por pedido quede coherente tras mover ítems. Best-effort.
async function rebuildDischarge(orderId: string, actor: { userId?: number }) {
  try {
    await reverseDischargeForOrder(orderId, actor);
    await autoDischargeOnOrderCreated(orderId, actor);
  } catch (e) {
    console.error('[order-move] No se pudo rearmar la descarga de', orderId, e);
  }
}

// ── Servicio principal ───────────────────────────────────────────────────────

export async function moveOrderToTable(input: MoveOrderInput) {
  const db = getTenantDb();
  const { orderId, targetTableId, items, userId, ip } = input;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Pedido ${orderId} no encontrado`);
  if (order.transferredSessionId != null) throw new Error('El pedido está transferido a caja y bloqueado');
  if (!EDITABLE_STATUSES.includes(order.status)) throw new Error(`No se puede mover un pedido en estado '${order.status}'`);
  if (order.paymentStatus === 'paid') throw new Error('El pedido ya está cobrado');
  await assertNoBilling(db, orderId);

  // Activación por caja del turno abierto del usuario.
  const session = await getActiveSessionForUser(userId);
  if (!session) throw new Error('Necesitas un turno de caja abierto');
  if (session.registerId != null) {
    const effective = await resolveForRegister(session.registerId);
    if (!effective[ENABLE_TABLE_MOVE]) throw new Error('Mover pedidos entre mesas no está habilitado para esta caja');
  }

  // Mesa destino.
  const [target] = await db.select().from(tables).where(eq(tables.id, targetTableId));
  if (!target) throw new Error('Mesa destino no encontrada');
  if (target.branchId !== order.branchId) throw new Error('La mesa destino es de otra sucursal');
  if (target.statusCode === 'disabled') throw new Error('La mesa destino está inhabilitada');
  if (order.tableId === targetTableId) throw new Error('El pedido ya está en esa mesa');

  const destActive = await getActiveOrderForTable(db, targetTableId, order.branchId);
  if (destActive && destActive.transferredSessionId != null) {
    throw new Error('El pedido de la mesa destino está transferido a caja');
  }

  const isTotal = !items || items.length === 0;
  let targetOrderId: string;

  if (isTotal && !destActive) {
    // TOTAL → mesa LIBRE: reasignar la mesa del mismo pedido (conserva el pedido).
    await db.update(orders).set({ tableId: targetTableId, tableName: target.name, updatedAt: new Date() }).where(eq(orders.id, orderId));
    targetOrderId = orderId;
  } else {
    // Los demás casos mueven ítems. Determinar el pedido destino.
    if (destActive) {
      targetOrderId = destActive.id;
    } else {
      // PARCIAL → mesa LIBRE: crear pedido destino con cabecera clonada del origen.
      targetOrderId = nanoid(12);
      const trackingCode = await genTrackingCode(db);
      await db.insert(orders).values({
        id: targetOrderId,
        branchId: order.branchId,
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        orderFor: order.orderFor,
        deliveryType: 'dine_in',
        deliveryInfo: order.deliveryInfo,
        salesChannelId: order.salesChannelId,
        salesChannelName: order.salesChannelName,
        tableId: target.id,
        tableName: target.name,
        waiterId: order.waiterId,
        cashSessionId: order.cashSessionId,
        subtotal: '0.00',
        deliveryFee: '0.00',
        retentionPercentage: order.retentionPercentage ?? '0.00',
        retentionAmount: '0.00',
        total: '0.00',
        trackingCode,
        status: order.status,
        paymentStatus: 'unpaid',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Ítems a mover: los indicados o todos (total → ocupada).
    let moves: MoveItemInput[];
    if (isTotal) {
      const all = await db.select({ id: orderItems.id, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId));
      moves = all.map((i) => ({ orderItemId: i.id, quantity: i.quantity }));
    } else {
      moves = items!;
    }

    await moveItems(db, orderId, targetOrderId, moves);

    // Recalcular totales/impuestos de ambos pedidos.
    await recalcTotals(db, targetOrderId);
    await recalcTotals(db, orderId);

    // Si el origen quedó sin ítems, se cierra (sin revertir stock: los ítems se movieron).
    const remaining = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
    if (remaining.length === 0) {
      await db.update(orders).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(orders.id, orderId));
    }

    // Rearmar descargas de stock para coherencia de costos (best-effort).
    await rebuildDischarge(orderId, { userId });
    await rebuildDischarge(targetOrderId, { userId });
  }

  // Sincronizar estado de mesas.
  await db.update(tables).set({ statusCode: 'in_kitchen', statusUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(tables.id, targetTableId));
  if (order.tableId != null && order.tableId !== targetTableId) {
    const sourceStillActive = await getActiveOrderForTable(db, order.tableId, order.branchId);
    if (!sourceStillActive) {
      await db.update(tables).set({ statusCode: 'available', statusUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(tables.id, order.tableId));
    }
  }

  await writeAuditLog({
    tableName: 'orders',
    operation: 'UPDATE',
    recordId: null,
    module: 'Pedidos',
    userId,
    description: `Movimiento de pedido ${orderId} a la mesa ${target.name}${isTotal ? ' (todo)' : ' (parcial)'}`,
    afterData: { sourceOrderId: orderId, targetOrderId, targetTableId, items: items ?? 'all' },
    ipAddress: ip ?? null,
  });

  return { sourceOrderId: orderId, targetOrderId };
}

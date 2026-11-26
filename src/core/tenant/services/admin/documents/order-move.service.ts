import { and, eq, inArray, desc, sql, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  orders,
  orderItems,
  orderItemExtras,
  orderSplits,
  tables,
  billingDocuments,
  cashSessions,
  salesChannels,
} from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { getActiveSessionForBranch, getActiveSessionForUserInBranch } from './cash.service';
import { resolveForRegister } from '../config-local/activation.service';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import { reverseDischargeForOrder, autoDischargeOnOrderCreated } from '../warehouse/sales-discharge.service';

const ENABLE_TABLE_MOVE = 'ENABLE_TABLE_MOVE';
const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'dispatched'] as const;
const EDITABLE_STATUSES = ['pending', 'confirmed', 'preparing'];

const toNum = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const round = (v: number) => Number(v.toFixed(2));

type Db = ReturnType<typeof getTenantDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbOrTx = Db | Tx;

type TaxSnap = { key: string; label: string; sunatCode?: string; rate: number; calculationType?: string; defaultActive?: boolean; isActive: boolean; amount?: number };

export interface MoveItemInput { orderItemId: number; quantity: number }
export interface MoveOrderInput {
  orderId: string;
  targetTableId: number;
  items?: MoveItemInput[]; // ausente/vacío = mover TODO el pedido
  userId: number;
  ownWaiterId?: number | null; // restringido a sus mesas ("Meseros solo ven sus mesas")
  // Comensales que pasan a la mesa destino en un movimiento PARCIAL (se restan del origen).
  // Ausentes = sin traslado de pax (comportamiento anterior). En la fusión total pasan todos.
  paxAdults?: number | null;
  paxChildren?: number | null;
  ip?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Pedido activo (dine_in, no terminal, más reciente) de una mesa, o null.
async function getActiveOrderForTable(
  db: DbOrTx,
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
async function recalcTotals(db: DbOrTx, orderId: string) {
  const ois = await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
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
async function genTrackingCode(db: DbOrTx): Promise<string> {
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
  db: DbOrTx,
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
      shortName: item.shortName ?? null,
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

// Turno abierto cuya caja decide si se puede mover (ver moveOrderToTable).
async function resolveMoveSession(
  db: ReturnType<typeof getTenantDb>,
  orderSessionId: number | null,
  userId: number,
  branchId: number,
) {
  if (orderSessionId != null) {
    const [own] = await db.select().from(cashSessions).where(eq(cashSessions.id, orderSessionId));
    if (own?.status === 'open') return own;
  }
  const mine = await getActiveSessionForUserInBranch(userId, branchId).catch(() => null);
  return mine ?? (await getActiveSessionForBranch(branchId));
}

// ── Servicio principal ───────────────────────────────────────────────────────

export async function moveOrderToTable(input: MoveOrderInput) {
  const db = getTenantDb();
  const { orderId, targetTableId, items, userId, ownWaiterId, ip } = input;
  const reqPaxAdults = input.paxAdults == null ? null : Math.floor(Number(input.paxAdults));
  const reqPaxChildren = input.paxChildren == null ? null : Math.floor(Number(input.paxChildren));
  if ((reqPaxAdults != null && (!Number.isFinite(reqPaxAdults) || reqPaxAdults < 0)) || (reqPaxChildren != null && (!Number.isFinite(reqPaxChildren) || reqPaxChildren < 0))) {
    throw new Error('Los comensales deben ser números enteros positivos');
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Pedido ${orderId} no encontrado`);
  if (order.transferredSessionId != null) throw new Error('El pedido está transferido a caja y bloqueado');
  if (!EDITABLE_STATUSES.includes(order.status)) throw new Error(`No se puede mover un pedido en estado '${order.status}'`);
  if (order.paymentStatus === 'paid') throw new Error('El pedido ya está cobrado');
  await assertNoBilling(db, orderId);

  // Activación por caja: la del turno del pedido; si ya cerró, la del turno del usuario en la
  // sucursal o la de cualquier turno abierto de la sucursal (el mozo no tiene turno propio).
  const session = await resolveMoveSession(db, order.cashSessionId, userId, order.branchId);
  if (!session) throw new Error('No hay un turno de caja abierto en la sucursal');
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
  if (ownWaiterId != null && destActive && destActive.waiterId !== ownWaiterId) {
    throw new Error('La mesa destino la atiende otro mozo');
  }

  const isTotal = !items || items.length === 0;

  // ¿El canal exige pax? Se valida que ninguna mesa con productos quede sin comensales.
  const [channel] = order.salesChannelId != null
    ? await db.select({ requirePax: salesChannels.requirePax }).from(salesChannels).where(eq(salesChannels.id, order.salesChannelId))
    : [];
  const requirePax = !!channel?.requirePax;

  // Todo en una transacción: pedido destino, ítems, totales, comensales y mesas, o nada.
  const { targetOrderId, movedPax } = await db.transaction(async (tx) => {
    let targetOrderId: string;
    let movedPax: { adults: number; children: number } | null = null;

    if (isTotal && !destActive) {
      // TOTAL → mesa LIBRE: reasignar la mesa del mismo pedido (conserva el pedido y sus pax).
      await tx.update(orders).set({ tableId: targetTableId, tableName: target.name, updatedAt: new Date() }).where(eq(orders.id, orderId));
      targetOrderId = orderId;
    } else {
      // Los demás casos mueven ítems. Determinar el pedido destino.
      if (destActive) {
        targetOrderId = destActive.id;
      } else {
        // PARCIAL → mesa LIBRE: crear pedido destino con cabecera clonada del origen.
        targetOrderId = nanoid(12);
        const trackingCode = await genTrackingCode(tx);
        await tx.insert(orders).values({
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
        const all = await tx.select({ id: orderItems.id, quantity: orderItems.quantity }).from(orderItems).where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
        moves = all.map((i) => ({ orderItemId: i.id, quantity: i.quantity }));
      } else {
        moves = items!;
      }

      await moveItems(tx, orderId, targetOrderId, moves);

      // Recalcular totales/impuestos de ambos pedidos.
      await recalcTotals(tx, targetOrderId);
      await recalcTotals(tx, orderId);

      // Si el origen quedó sin ítems, se cierra (sin revertir stock: los ítems se movieron).
      const remaining = await tx.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt))).limit(1);
      const sourceEmpty = remaining.length === 0;
      if (sourceEmpty) {
        await tx.update(orders).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(orders.id, orderId));
      }

      // Comensales: se TRASLADAN (lo que gana el destino lo pierde el origen), nunca se copian,
      // para que el aforo de la sucursal no cuente a nadie dos veces ni pierda a nadie.
      const srcAdults = order.paxAdults;
      const srcChildren = order.paxChildren ?? 0;
      let moveAdults: number;
      let moveChildren: number;
      if (sourceEmpty) {
        // El origen se cierra: todos sus comensales pasan al destino.
        moveAdults = srcAdults ?? 0;
        moveChildren = order.paxChildren ?? 0;
        if (!destActive && reqPaxAdults != null && srcAdults == null) {
          moveAdults = reqPaxAdults;
          moveChildren = reqPaxChildren ?? 0;
        }
      } else {
        moveAdults = reqPaxAdults ?? 0;
        moveChildren = reqPaxChildren ?? 0;
        if (srcAdults != null) {
          if (moveAdults > srcAdults) throw new Error(`Solo hay ${srcAdults} adulto(s) en la mesa de origen`);
          if (moveChildren > srcChildren) throw new Error(`Solo hay ${srcChildren} niño(s) en la mesa de origen`);
          if (requirePax && srcAdults - moveAdults < 1) {
            throw new Error('La mesa de origen debe quedar con al menos un comensal adulto');
          }
        }
      }
      if (requirePax && !destActive && reqPaxAdults != null && moveAdults < 1) {
        throw new Error('Indica al menos un comensal adulto para la mesa destino');
      }

      if (moveAdults > 0 || moveChildren > 0) {
        movedPax = { adults: moveAdults, children: moveChildren };
        const destBase = destActive
          ? { adults: destActive.paxAdults, children: destActive.paxChildren }
          : { adults: null as number | null, children: null as number | null };
        await tx.update(orders).set({
          paxAdults: (destBase.adults ?? 0) + moveAdults || null,
          paxChildren: (destBase.children ?? 0) + moveChildren || null,
          updatedAt: new Date(),
        }).where(eq(orders.id, targetOrderId));
        if (!sourceEmpty && srcAdults != null) {
          await tx.update(orders).set({
            paxAdults: srcAdults - moveAdults || null,
            paxChildren: srcChildren - moveChildren || null,
            updatedAt: new Date(),
          }).where(eq(orders.id, orderId));
        }
      }
    }

    // Sincronizar estado de mesas.
    await tx.update(tables).set({ statusCode: 'in_kitchen', statusUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(tables.id, targetTableId));
    if (order.tableId != null && order.tableId !== targetTableId) {
      const sourceStillActive = await getActiveOrderForTable(tx, order.tableId, order.branchId);
      if (!sourceStillActive) {
        await tx.update(tables).set({ statusCode: 'available', statusUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(tables.id, order.tableId));
      }
    }

    return { targetOrderId, movedPax };
  });

  // Rearmar descargas de stock para coherencia de costos (best-effort, fuera de la transacción).
  if (targetOrderId !== orderId) {
    await rebuildDischarge(orderId, { userId });
    await rebuildDischarge(targetOrderId, { userId });
  }

  await writeAuditLog({
    tableName: 'orders',
    operation: 'UPDATE',
    recordId: null,
    module: 'Pedidos',
    userId,
    description: `Movimiento de pedido ${orderId} a la mesa ${target.name}${isTotal ? ' (todo)' : ' (parcial)'}`,
    afterData: { sourceOrderId: orderId, targetOrderId, targetTableId, items: items ?? 'all', movedPax },
    ipAddress: ip ?? null,
  });

  return { sourceOrderId: orderId, targetOrderId };
}

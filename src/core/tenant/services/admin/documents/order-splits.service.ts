import { eq, and, inArray, sql } from 'drizzle-orm';
import { orders, orderItems, orderSplits, tables, orderPayments } from '../../../../../db/tenant/schema';

import { getTenantDb } from '../../../../../utils/tenant-context';
import { type TaxSnapshotEntry, prorateTaxSnapshot } from '../../shared/taxes.service';
import { recordSplitSaleIncome, reverseSplitSaleIncome, getActiveSessionForUser } from './cash.service';
import { findPaymentMethodByName } from '../config-local/payment-method.service';
import type { AuditActor } from '../warehouse/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateSplitInput {
  orderId: string;
  label: string;
  splitType?: 'by_item' | 'by_amount';
  customConcept?: string;
  amount?: number;
}

export interface AssignItemsInput {
  itemIds: number[];
  splitId: number | null;
}

export interface UpdateSplitPaymentInput {
  paymentStatus: 'unpaid' | 'paid' | 'review_pending';
  paymentMethod?: string;
  paymentMethodId?: number | null;
  retentionPercentage?: number;
  payments?: Array<{
    paymentMethodId?: number | null;
    paymentMethod: string;
    amount: number;
    retentionPercentage?: number;
    retentionAmount?: number;
    reference?: string;
    receivedAmount?: number;
    changeAmount?: number;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function recalcSplitTotals(db: ReturnType<typeof getTenantDb>, splitId: number) {
  const [split] = await db
    .select()
    .from(orderSplits)
    .where(eq(orderSplits.id, splitId));
  if (!split) return;

  if (split.splitType === 'by_amount') {
    const subtotal = Number(split.subtotal ?? split.total ?? 0);
    const retentionPercentage = Number(split.retentionPercentage ?? 0);
    const retentionAmount = (subtotal * retentionPercentage) / 100;
    await db
      .update(orderSplits)
      .set({
        retentionAmount: String(retentionAmount.toFixed(2)),
        total: String(subtotal.toFixed(2)),
        updatedAt: new Date(),
      })
      .where(eq(orderSplits.id, splitId));
    return;
  }

  const items = await db
    .select({ totalPrice: orderItems.totalPrice })
    .from(orderItems)
    .where(eq(orderItems.splitId, splitId));

  const total = items.reduce((s, i) => s + parseFloat(i.totalPrice), 0);
  const retentionPercentage = Number(split.retentionPercentage ?? 0);
  const retentionAmount = (total * retentionPercentage) / 100;

  // La retención no se le cobra al cliente: `total` es siempre el subtotal de la cuenta.
  await db
    .update(orderSplits)
    .set({
      subtotal: String(total.toFixed(2)),
      retentionAmount: String(retentionAmount.toFixed(2)),
      total: String(total.toFixed(2)),
      updatedAt: new Date(),
    })
    .where(eq(orderSplits.id, splitId));
}

async function assertOrderEditable(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (['cancelled', 'completed'].includes(order.status)) {
    throw new Error('No se pueden modificar cuentas de un pedido cancelado o completado');
  }
}

// ── Create split ───────────────────────────────────────────────────────────────

export async function createSplit(input: CreateSplitInput) {
  const db = getTenantDb();
  await assertOrderEditable(db, input.orderId);

  const splitType = input.splitType ?? 'by_item';
  const customConcept = input.customConcept?.trim() || 'Por consumo de alimentos y bebidas';
  const subtotal = input.amount ? Number(input.amount).toFixed(2) : '0.00';

  const [split] = await db
    .insert(orderSplits)
    .values({
      orderId: input.orderId,
      label: input.label.trim() || 'Cuenta',
      splitType,
      customConcept,
      subtotal,
      total: subtotal,
    })
    .returning();

  await syncOrderPaymentStatus(db, input.orderId);
  return split;
}

// Crear cuentas divididas en partes iguales (÷N) con cálculo y redondeo exacto al céntimo
export async function createEqualSplits(orderId: string, partsCount: number) {
  const db = getTenantDb();
  await assertOrderEditable(db, orderId);

  if (partsCount < 2 || partsCount > 20) {
    throw new Error('El número de partes debe ser entre 2 y 20');
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');

  const baseTotal = Number(order.subtotal ?? 0) + Number(order.deliveryFee ?? 0);
  if (baseTotal <= 0) {
    throw new Error('El pedido no tiene un monto válido para dividir');
  }

  const existingSplits = await db.select().from(orderSplits).where(eq(orderSplits.orderId, orderId));
  if (existingSplits.some((s) => s.paymentStatus === 'paid')) {
    throw new Error('No se pueden regenerar cuentas porque ya existen pagos registrados');
  }

  // Desasignar ítems y borrar cuentas previas
  await db.update(orderItems).set({ splitId: null }).where(eq(orderItems.orderId, orderId));
  await db.delete(orderSplits).where(eq(orderSplits.orderId, orderId));

  // Centavos totales para redondeo exacto
  const totalCents = Math.round(baseTotal * 100);
  const baseCents = Math.floor(totalCents / partsCount);
  const remainder = totalCents % partsCount;

  const insertedSplits = [];
  for (let i = 0; i < partsCount; i++) {
    const partCents = baseCents + (i < remainder ? 1 : 0);
    const partAmount = (partCents / 100).toFixed(2);

    const [newSplit] = await db
      .insert(orderSplits)
      .values({
        orderId,
        label: `Comensal ${i + 1}`,
        splitType: 'by_amount',
        customConcept: 'Por consumo de alimentos y bebidas',
        subtotal: partAmount,
        total: partAmount,
      })
      .returning();
    insertedSplits.push(newSplit);
  }

  await syncOrderPaymentStatus(db, orderId);
  return insertedSplits;
}

// Crear cuentas divididas por montos personalizados libres
export async function createCustomAmountSplits(
  orderId: string,
  parts: Array<{ label: string; amount: number; customConcept?: string }>
) {
  const db = getTenantDb();
  await assertOrderEditable(db, orderId);

  if (!Array.isArray(parts) || parts.length < 2) {
    throw new Error('Se requieren al menos 2 cuentas para dividir por monto');
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');

  const baseTotal = Number(order.subtotal ?? 0) + Number(order.deliveryFee ?? 0);
  const partsSum = parts.reduce((acc, p) => acc + Number(p.amount || 0), 0);

  if (Math.abs(partsSum - baseTotal) > 0.05) {
    throw new Error(
      `La suma de las cuentas (S/ ${partsSum.toFixed(2)}) no coincide con el total del pedido (S/ ${baseTotal.toFixed(2)})`
    );
  }

  const existingSplits = await db.select().from(orderSplits).where(eq(orderSplits.orderId, orderId));
  if (existingSplits.some((s) => s.paymentStatus === 'paid')) {
    throw new Error('No se pueden regenerar cuentas porque ya existen pagos registrados');
  }

  await db.update(orderItems).set({ splitId: null }).where(eq(orderItems.orderId, orderId));
  await db.delete(orderSplits).where(eq(orderSplits.orderId, orderId));

  const insertedSplits = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const amountStr = Number(p.amount).toFixed(2);
    const [newSplit] = await db
      .insert(orderSplits)
      .values({
        orderId,
        label: p.label?.trim() || `Cuenta ${i + 1}`,
        splitType: 'by_amount',
        customConcept: p.customConcept?.trim() || 'Por consumo de alimentos y bebidas',
        subtotal: amountStr,
        total: amountStr,
      })
      .returning();
    insertedSplits.push(newSplit);
  }

  await syncOrderPaymentStatus(db, orderId);
  return insertedSplits;
}

// ── List splits with their items ───────────────────────────────────────────────

export async function listSplits(orderId: string) {
  const db = getTenantDb();

  const splits = await db
    .select()
    .from(orderSplits)
    .where(eq(orderSplits.orderId, orderId));

  const allItems = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  return splits.map((split) => ({
    ...split,
    items: allItems.filter((item) => item.splitId === split.id),
  }));
}

// ── Assign items to a split (or unassign by passing splitId = null) ────────────

export async function assignItems(orderId: string, input: AssignItemsInput) {
  const db = getTenantDb();
  await assertOrderEditable(db, orderId);

  if (input.itemIds.length === 0) throw new Error('Debes indicar al menos un ítem');

  // Validate target split belongs to this order
  if (input.splitId !== null) {
    const [split] = await db
      .select({ id: orderSplits.id })
      .from(orderSplits)
      .where(and(eq(orderSplits.id, input.splitId), eq(orderSplits.orderId, orderId)));
    if (!split) throw new Error('La cuenta no pertenece a este pedido');

    // A split that already has a billing document cannot receive more items
    const { billingDocuments } = await import('../../../../../db/tenant/schema');
    const [existingDoc] = await db
      .select({ id: billingDocuments.id })
      .from(billingDocuments)
      .where(
        and(
          eq(billingDocuments.splitId, input.splitId),
          sql`${billingDocuments.status} != 'voided'`
        )
      )
      .limit(1);
    if (existingDoc) {
      throw new Error('Esta cuenta ya tiene un comprobante emitido y no puede modificarse');
    }
  }

  // Validate all items belong to this order
  const items = await db
    .select({ id: orderItems.id, splitId: orderItems.splitId })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), inArray(orderItems.id, input.itemIds)));

  if (items.length !== input.itemIds.length) {
    throw new Error('Uno o más ítems no pertenecen a este pedido');
  }

  // Prevent moving items that are already billed in another split
  const billedSplitIds = [...new Set(items.map((i) => i.splitId).filter(Boolean))] as number[];
  if (billedSplitIds.length > 0) {
    const { billingDocuments } = await import('../../../../../db/tenant/schema');
    const billedDocs = await db
      .select({ splitId: billingDocuments.splitId })
      .from(billingDocuments)
      .where(
        and(
          inArray(billingDocuments.splitId as any, billedSplitIds),
          sql`${billingDocuments.status} != 'voided'`
        )
      );
    const billedSet = new Set(billedDocs.map((d) => d.splitId));
    const hasBilledItem = items.some((i) => i.splitId && billedSet.has(i.splitId));
    if (hasBilledItem) {
      throw new Error('Uno o más ítems pertenecen a una cuenta que ya fue facturada');
    }
  }

  // Collect split ids that will be affected (for recalc)
  const previousSplitIds = [...new Set(items.map((i) => i.splitId).filter((id): id is number => id !== null))];

  await db
    .update(orderItems)
    .set({ splitId: input.splitId })
    .where(inArray(orderItems.id, input.itemIds));

  // Recalculate totals for all affected splits
  const splitsToRecalc = new Set([...previousSplitIds, ...(input.splitId !== null ? [input.splitId] : [])]);
  for (const sid of splitsToRecalc) {
    await recalcSplitTotals(db, sid);
  }

  await syncOrderPaymentStatus(db, orderId);
  return listSplits(orderId);
}

// ── Sync order-level paymentStatus from splits ────────────────────────────────

async function syncOrderPaymentStatus(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const splits = await db
    .select({
      paymentStatus: orderSplits.paymentStatus,
      retentionAmount: orderSplits.retentionAmount,
      paymentMethod: orderSplits.paymentMethod,
    })
    .from(orderSplits)
    .where(eq(orderSplits.orderId, orderId));

  if (splits.length === 0) {
    const [order] = await db
      .select({
        subtotal: orders.subtotal,
        deliveryFee: orders.deliveryFee,
      })
      .from(orders)
      .where(eq(orders.id, orderId));
    const baseAmount = Number(order?.subtotal ?? 0) + Number(order?.deliveryFee ?? 0);
    await db
      .update(orders)
      .set({
        paymentStatus: 'unpaid',
        retentionAmount: '0.00',
        total: baseAmount.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    return;
  }

  const allPaid  = splits.every((s) => s.paymentStatus === 'paid');
  const somePaid = splits.some((s)  => s.paymentStatus === 'paid');

  const newStatus: 'unpaid' | 'paid' | 'review_pending' =
    allPaid  ? 'paid'           :
    somePaid ? 'review_pending' :
               'unpaid';

  const [order] = await db
    .select({
      subtotal: orders.subtotal,
      deliveryFee: orders.deliveryFee,
      tableId: orders.tableId,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .where(eq(orders.id, orderId));

  const baseAmount = Number(order?.subtotal ?? 0) + Number(order?.deliveryFee ?? 0);
  const retentionAmount = splits.reduce((sum, split) => sum + Number(split.retentionAmount ?? 0), 0);
  // La retención acumulada de las cuentas queda informativa en `retentionAmount`;
  // el total del pedido nunca la incluye (el cliente no la paga).
  const total = baseAmount;

  // Misma regla que el cobro completo (updateOrderPaymentStatus): cuando TODOS los
  // splits quedan pagados, el pedido se cierra. No se pisa un anulado ni se reescribe
  // uno ya cerrado.
  const shouldComplete =
    newStatus === 'paid' &&
    order?.paymentStatus !== 'paid' &&
    order?.status !== 'cancelled' &&
    order?.status !== 'completed';

  await db
    .update(orders)
    .set({
      paymentStatus: newStatus,
      ...(shouldComplete ? { status: 'completed' as const } : {}),
      retentionAmount: retentionAmount.toFixed(2),
      total: total.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  if (order?.tableId && newStatus === 'paid') {
    await db.update(tables).set({
      statusCode: 'dirty',
      statusUpdatedAt: new Date(),
      updatedAt: new Date()
    }).where(eq(tables.id, order.tableId));
  }

  // El ingreso a caja se registra POR CADA cuenta/split al marcarse pagada
  // (ver updateSplitPayment → recordSplitSaleIncome), no de forma consolidada aquí.
}


// ── Update split payment status ────────────────────────────────────────────────

export async function updateSplitPayment(splitId: number, orderId: string, input: UpdateSplitPaymentInput, actor?: AuditActor) {
  const db = getTenantDb();

  const [split] = await db
    .select()
    .from(orderSplits)
    .where(and(eq(orderSplits.id, splitId), eq(orderSplits.orderId, orderId)));

  if (!split) throw new Error('Cuenta no encontrada');

  const baseAmount = Number(split.subtotal ?? 0);
  const retentionPercentage = input.paymentStatus === 'paid'
    ? Number((input.retentionPercentage ?? split.retentionPercentage ?? 0))
    : 0;
  const retentionAmount = input.paymentStatus === 'paid'
    ? (baseAmount * retentionPercentage) / 100
    : 0;

  // Preferir el id enviado (preciso); si no, resolver por nombre (fallback legacy).
  const resolvedMethodId = input.paymentMethodId ?? (
    input.paymentMethod !== undefined ? (await findPaymentMethodByName(input.paymentMethod))?.id ?? null : null
  );

  const [updated] = await db
    .update(orderSplits)
    .set({
      paymentStatus: input.paymentStatus,
      ...(input.paymentMethod !== undefined || input.paymentMethodId !== undefined
        ? { paymentMethod: input.paymentMethod ?? null, paymentMethodId: resolvedMethodId }
        : {}),
      retentionPercentage: retentionPercentage.toFixed(2),
      retentionAmount: retentionAmount.toFixed(2),
      // La retención no se le cobra al cliente: total = lo que efectivamente paga.
      total: baseAmount.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(orderSplits.id, splitId))
    .returning();

  // Si se enviaron métodos de pago detallados (multi-tender), registrarlos en order_payments vinculados al split
  if (input.paymentStatus === 'paid' && input.payments && input.payments.length > 0) {
    await db.delete(orderPayments).where(eq(orderPayments.splitId, splitId));
    for (const p of input.payments) {
      const [m] = p.paymentMethodId ? await db.select({ isCash: paymentMethods.isCash }).from(paymentMethods).where(eq(paymentMethods.id, p.paymentMethodId)) : [];
      const isCash = m?.isCash ?? (p.paymentMethod.toLowerCase().includes('efectivo') || p.paymentMethod.toLowerCase().includes('cash'));
      await db.insert(orderPayments).values({
        orderId,
        splitId,
        paymentMethodId: p.paymentMethodId ?? null,
        paymentMethod: p.paymentMethod,
        amount: Number(p.amount).toFixed(2),
        isCash,
        retentionPercentage: Number(p.retentionPercentage ?? 0).toFixed(2),
        retentionAmount: Number(p.retentionAmount ?? 0).toFixed(2),
        createdById: actor?.userId ?? null,
      });
    }
  } else if (input.paymentStatus === 'unpaid') {
    await db.delete(orderPayments).where(eq(orderPayments.splitId, splitId));
  }

  await syncOrderPaymentStatus(db, orderId);

  // #5: ingreso a caja por cuenta/split. Al pagar registra; al desmarcar revierte.
  // El ingreso va al turno del cajero que cobra (actor), no al del mozo que creó el pedido.
  try {
    if (input.paymentStatus === 'paid') {
      const cajeraSession = await getActiveSessionForUser(actor?.userId);
      if (!cajeraSession) throw new Error('Necesitas un turno de caja abierto para cobrar esta cuenta');
      await recordSplitSaleIncome(splitId, actor, cajeraSession.id);
    } else {
      await reverseSplitSaleIncome(splitId, actor);
    }
  } catch (e: any) {
    // Relanzar errores de guard (turno cerrado); silenciar errores internos de registro.
    if (e?.message?.includes('turno de caja')) throw e;
    console.error('No se pudo registrar/revertir el ingreso de caja de la cuenta', splitId, e);
  }

  return updated;
}

// ── Delete split (items return to unassigned) ──────────────────────────────────

export async function deleteSplit(splitId: number, orderId: string) {
  const db = getTenantDb();

  const [split] = await db
    .select()
    .from(orderSplits)
    .where(and(eq(orderSplits.id, splitId), eq(orderSplits.orderId, orderId)));

  if (!split) throw new Error('Cuenta no encontrada');

  // Block deletion if split has an active billing document
  const { billingDocuments } = await import('../../../../../db/tenant/schema');
  const [existingDoc] = await db
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(and(eq(billingDocuments.splitId, splitId), sql`${billingDocuments.status} != 'voided'`))
    .limit(1);

  if (existingDoc) {
    throw new Error('No se puede eliminar una cuenta que ya tiene un comprobante emitido');
  }

  // Return items to unassigned
  await db.update(orderItems).set({ splitId: null }).where(eq(orderItems.splitId, splitId));

  await db.delete(orderSplits).where(eq(orderSplits.id, splitId));
  await syncOrderPaymentStatus(db, orderId);
}

// ── Split item quantity (creates a new item with the given qty, reduces original) ─

export async function splitItemQuantity(
  orderId: string,
  itemId: number,
  qty: number,
  targetSplitId: number | null,
) {
  const db = getTenantDb();
  await assertOrderEditable(db, orderId);

  const [item] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));

  if (!item) throw new Error('Ítem no encontrado en el pedido');
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('La cantidad debe ser un entero mayor a 0');
  if (qty >= item.quantity) throw new Error('La cantidad a dividir debe ser menor a la cantidad total del ítem');

  if (targetSplitId !== null) {
    const [split] = await db
      .select({ id: orderSplits.id })
      .from(orderSplits)
      .where(and(eq(orderSplits.id, targetSplitId), eq(orderSplits.orderId, orderId)));
    if (!split) throw new Error('La cuenta no pertenece a este pedido');
  }

  const remainQty = item.quantity - qty;
  const pricePerUnit = parseFloat(item.totalPrice) / item.quantity;
  const newTotalPrice = (pricePerUnit * qty).toFixed(2);
  const remainTotalPrice = (pricePerUnit * remainQty).toFixed(2);

  // El importe se reparte por cantidad, así que los impuestos se prorratean con la
  // misma razón. Sin esto la mitad nueva sale sin taxSnapshot y su comprobante cae
  // al IGV por defecto en vez de usar los impuestos con los que se vendió.
  const snapshot = item.taxSnapshot as TaxSnapshotEntry[] | null;
  const newTaxSnapshot = prorateTaxSnapshot(snapshot, qty / item.quantity);
  const remainTaxSnapshot = prorateTaxSnapshot(snapshot, remainQty / item.quantity);

  await db
    .update(orderItems)
    .set({
      quantity: remainQty,
      totalPrice: remainTotalPrice,
      ...(remainTaxSnapshot ? { taxSnapshot: remainTaxSnapshot as any } : {}),
    })
    .where(eq(orderItems.id, itemId));

  await db.insert(orderItems).values({
    orderId,
    splitId: targetSplitId,
    productId: item.productId,
    salesChannelId: item.salesChannelId,
    productName: item.productName,
    unitPrice: item.unitPrice,
    quantity: qty,
    selectedAlternatives: item.selectedAlternatives as any,
    packagingFee: item.packagingFee,
    notes: item.notes,
    totalPrice: newTotalPrice,
    taxSnapshot: newTaxSnapshot as any,
  });

  const splitsToRecalc = new Set<number>();
  if (item.splitId !== null) splitsToRecalc.add(item.splitId);
  if (targetSplitId !== null) splitsToRecalc.add(targetSplitId);
  for (const sid of splitsToRecalc) await recalcSplitTotals(db, sid);

  await syncOrderPaymentStatus(db, orderId);
  return listSplits(orderId);
}

// ── Update split label ─────────────────────────────────────────────────────────

export async function updateSplitLabel(splitId: number, orderId: string, label: string) {
  const db = getTenantDb();

  const [split] = await db
    .select()
    .from(orderSplits)
    .where(and(eq(orderSplits.id, splitId), eq(orderSplits.orderId, orderId)));

  if (!split) throw new Error('Cuenta no encontrada');

  const [updated] = await db
    .update(orderSplits)
    .set({ label: label.trim() || split.label, updatedAt: new Date() })
    .where(eq(orderSplits.id, splitId))
    .returning();

  return updated;
}

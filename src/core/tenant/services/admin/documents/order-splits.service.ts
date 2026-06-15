import { eq, and, inArray, sql } from 'drizzle-orm';
import { orders, orderItems, orderSplits } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateSplitInput {
  orderId: string;
  label: string;
}

export interface AssignItemsInput {
  itemIds: number[];
  splitId: number | null;
}

export interface UpdateSplitPaymentInput {
  paymentStatus: 'unpaid' | 'paid' | 'review_pending';
  paymentMethod?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function recalcSplitTotals(db: ReturnType<typeof getTenantDb>, splitId: number) {
  const items = await db
    .select({ totalPrice: orderItems.totalPrice })
    .from(orderItems)
    .where(eq(orderItems.splitId, splitId));

  const total = items.reduce((s, i) => s + parseFloat(i.totalPrice), 0);

  await db
    .update(orderSplits)
    .set({
      subtotal: String(total.toFixed(2)),
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

  const [split] = await db
    .insert(orderSplits)
    .values({
      orderId: input.orderId,
      label: input.label.trim() || 'Cuenta',
    })
    .returning();

  return split;
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

  return listSplits(orderId);
}

// ── Sync order-level paymentStatus from splits ────────────────────────────────

async function syncOrderPaymentStatus(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const splits = await db
    .select({ paymentStatus: orderSplits.paymentStatus })
    .from(orderSplits)
    .where(eq(orderSplits.orderId, orderId));

  if (splits.length === 0) return;

  const allPaid  = splits.every((s) => s.paymentStatus === 'paid');
  const somePaid = splits.some((s)  => s.paymentStatus === 'paid');

  const newStatus: 'unpaid' | 'paid' | 'review_pending' =
    allPaid  ? 'paid'           :
    somePaid ? 'review_pending' :
               'unpaid';

  await db
    .update(orders)
    .set({ paymentStatus: newStatus, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

// ── Update split payment status ────────────────────────────────────────────────

export async function updateSplitPayment(splitId: number, orderId: string, input: UpdateSplitPaymentInput) {
  const db = getTenantDb();

  const [split] = await db
    .select()
    .from(orderSplits)
    .where(and(eq(orderSplits.id, splitId), eq(orderSplits.orderId, orderId)));

  if (!split) throw new Error('Cuenta no encontrada');

  const [updated] = await db
    .update(orderSplits)
    .set({
      paymentStatus: input.paymentStatus,
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
      updatedAt: new Date(),
    })
    .where(eq(orderSplits.id, splitId))
    .returning();

  await syncOrderPaymentStatus(db, orderId);

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

  await db
    .update(orderItems)
    .set({ quantity: remainQty, totalPrice: remainTotalPrice })
    .where(eq(orderItems.id, itemId));

  await db.insert(orderItems).values({
    orderId,
    splitId: targetSplitId,
    productId: item.productId,
    productName: item.productName,
    unitPrice: item.unitPrice,
    quantity: qty,
    selectedAlternatives: item.selectedAlternatives as any,
    packagingFee: item.packagingFee,
    notes: item.notes,
    totalPrice: newTotalPrice,
  });

  const splitsToRecalc = new Set<number>();
  if (item.splitId !== null) splitsToRecalc.add(item.splitId);
  if (targetSplitId !== null) splitsToRecalc.add(targetSplitId);
  for (const sid of splitsToRecalc) await recalcSplitTotals(db, sid);

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

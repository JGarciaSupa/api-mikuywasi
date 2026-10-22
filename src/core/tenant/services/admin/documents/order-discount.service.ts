import { orders, orderItems, orderSplits, reasons } from '@/db/tenant/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import { toNum, roundMoney } from '../warehouse/shared/numbers';
import { resolveLineTaxes, type TaxConfig, type TaxSnapshotEntry } from '../../shared/taxes.service';
import { recalcOrderTotals } from '../config-local/waiter-order.service';
import { clearOrderDiscount } from './order-discount-clear';
import type { AuditActor } from '../warehouse/types';

export interface ApplyDiscountInput {
  reasonId: number;
  // Solo para motivos en modo 'manual': importe a descontar (S/)
  manualAmount?: number;
}

const r2 = (n: number) => roundMoney(n, 2);

async function loadDiscountableOrder(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (order.status === 'cancelled' || order.status === 'completed') throw new Error('No se puede aplicar descuento a un pedido anulado o cerrado');
  if (order.paymentStatus === 'paid') throw new Error('El pedido ya está pagado');
  if (order.transferredSessionId != null) throw new Error('El pedido está transferido a caja; regrésalo para modificarlo');
  const splits = await db.select({ id: orderSplits.id }).from(orderSplits).where(eq(orderSplits.orderId, orderId)).limit(1);
  if (splits.length > 0) throw new Error('Aplica el descuento antes de dividir la cuenta');
  return order;
}

/**
 * Aplica un descuento del catálogo (reasons type='discount') al pedido completo.
 * El importe se reparte entre las líneas en proporción a su importe y se recalculan los
 * impuestos de cada línea: así el comprobante (y SUNAT) recibe precios ya descontados con
 * el IGV correcto, sin cambios en el facturador. Reemplaza un descuento previo.
 * El delivery no se descuenta.
 */
export async function applyOrderDiscount(orderId: string, input: ApplyDiscountInput, actor?: AuditActor) {
  const db = getTenantDb();
  const order = await loadDiscountableOrder(db, orderId);

  const [reason] = await db.select().from(reasons)
    .where(and(eq(reasons.id, input.reasonId), eq(reasons.branchId, order.branchId), eq(reasons.type, 'discount')));
  if (!reason || !reason.isActive) throw new Error('Motivo de descuento inválido o inactivo');

  return db.transaction(async (tx) => {
    // Partir siempre de los importes sin descuento (reemplaza el descuento anterior)
    await clearOrderDiscount(tx as never, orderId);
    const lines = await tx.select().from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
    if (lines.length === 0) throw new Error('El pedido no tiene productos');
    if (lines.some((l) => !(l.taxSnapshot as TaxSnapshotEntry[] | null)?.length)) {
      throw new Error('El pedido tiene productos sin desglose de impuestos; no se puede aplicar descuento');
    }

    const gross = r2(lines.reduce((s, l) => s + toNum(l.totalPrice), 0));
    let amount: number;
    if (reason.discountMode === 'percentage') {
      const pct = toNum(reason.discountValue);
      if (pct <= 0 || pct > 100) throw new Error('El porcentaje del motivo no es válido');
      amount = r2((gross * pct) / 100);
    } else if (reason.discountMode === 'amount') {
      amount = r2(toNum(reason.discountValue));
    } else {
      if (input.manualAmount == null) throw new Error('Indica el importe del descuento');
      amount = r2(input.manualAmount);
    }
    if (amount <= 0) throw new Error('El descuento debe ser mayor a 0');
    if (reason.maxAmount != null && amount > toNum(reason.maxAmount)) {
      throw new Error(`El descuento (S/ ${amount.toFixed(2)}) supera el tope del motivo (S/ ${toNum(reason.maxAmount).toFixed(2)})`);
    }
    if (amount >= gross) throw new Error(`El descuento debe ser menor al subtotal (S/ ${gross.toFixed(2)})`);

    // Prorrateo: cada línea en proporción a su importe; la línea mayor absorbe el redondeo
    const sorted = [...lines].sort((a, b) => toNum(b.totalPrice) - toNum(a.totalPrice));
    const shares = new Map<number, number>();
    let assigned = 0;
    for (const l of sorted.slice(1)) {
      const share = r2((amount * toNum(l.totalPrice)) / gross);
      shares.set(l.id, share);
      assigned = r2(assigned + share);
    }
    shares.set(sorted[0].id, r2(amount - assigned));

    for (const l of lines) {
      const share = shares.get(l.id) ?? 0;
      const net = r2(toNum(l.totalPrice) - share);
      if (net < 0) throw new Error('El descuento no se pudo repartir entre los productos');
      await tx.update(orderItems).set({
        totalPrice: net.toFixed(2),
        discountAmount: share.toFixed(2),
        taxSnapshot: resolveLineTaxes(net, l.quantity, l.taxSnapshot as TaxConfig[]).taxSnapshot as any,
      }).where(eq(orderItems.id, l.id));
    }

    await recalcOrderTotals(tx as never, orderId);
    const [updated] = await tx.update(orders).set({
      discountAmount: amount.toFixed(2),
      discountReasonId: reason.id,
      discountMotivo: reason.description,
      discountMode: reason.discountMode,
      discountValue: reason.discountValue,
      discountById: actor?.userId ?? null,
      discountAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId)).returning();

    return { order: updated, discountAmount: amount.toFixed(2), grossSubtotal: gross.toFixed(2) };
  });
}

/** Quita el descuento del pedido y restaura los importes de las líneas. */
export async function removeOrderDiscount(orderId: string) {
  const db = getTenantDb();
  await loadDiscountableOrder(db, orderId);
  return db.transaction(async (tx) => {
    const had = await clearOrderDiscount(tx as never, orderId);
    if (!had) throw new Error('El pedido no tiene descuento');
    await recalcOrderTotals(tx as never, orderId);
    const [updated] = await tx.select().from(orders).where(eq(orders.id, orderId));
    return { order: updated };
  });
}

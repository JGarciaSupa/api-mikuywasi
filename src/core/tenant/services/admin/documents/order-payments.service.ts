import { orders, orderPayments, paymentMethods, tables } from '@/db/tenant/schema';
import { eq, inArray } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import { toNum, roundMoney } from '../warehouse/shared/numbers';
import { recordOrderMultiPaymentIncome, getActiveSessionForUser } from './cash.service';
import type { AuditActor } from '../warehouse/types';

export interface OrderPaymentLineInput {
  paymentMethodId: number;
  amount: number;
  tipAmount?: number;
  reference?: string;
}

// Etiqueta que queda en orders.payment_method para un cobro mixto (los reportes que
// agrupan por método muestran "Mixto"; el desglose real vive en order_payments).
export const MIXED_PAYMENT_LABEL = 'Mixto';

/**
 * Cobra un pedido con VARIOS métodos de pago (pago mixto).
 * Mismas reglas que el cobro con un método (updateOrderPaymentStatus): exige turno de caja
 * abierto del cajero, marca el pedido pagado + completado y la mesa como 'dirty'.
 * La suma de los importes debe ser exactamente el total a cobrar (subtotal + delivery).
 * La retención de cada método se calcula sobre su importe y no se le cobra al cliente.
 */
export async function payOrderWithMultiplePayments(
  orderId: string,
  lines: OrderPaymentLineInput[],
  actor?: AuditActor,
) {
  const db = getTenantDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (order.status === 'cancelled') throw new Error('No se puede cobrar un pedido anulado');
  if (order.paymentStatus === 'paid') throw new Error('El pedido ya está pagado');
  if (lines.length < 2) throw new Error('El pago mixto requiere al menos dos métodos de pago');

  const methodIds = [...new Set(lines.map((l) => l.paymentMethodId))];
  if (methodIds.length !== lines.length) throw new Error('No repitas el mismo método de pago en el pago mixto');

  const methods = await db.select().from(paymentMethods).where(inArray(paymentMethods.id, methodIds));
  for (const id of methodIds) {
    const m = methods.find((x) => x.id === id);
    if (!m || !m.isActive) throw new Error('Uno de los métodos de pago no existe o está inactivo');
    if (m.branchId != null && m.branchId !== order.branchId) throw new Error(`El método "${m.name}" no pertenece a esta sucursal`);
  }

  const baseAmount = roundMoney(toNum(order.subtotal) + toNum(order.deliveryFee), 2);
  const paidSum = roundMoney(lines.reduce((s, l) => s + l.amount, 0), 2);
  if (Math.abs(paidSum - baseAmount) > 0.009) {
    throw new Error(`La suma de los pagos (S/ ${paidSum.toFixed(2)}) debe ser igual al total a cobrar (S/ ${baseAmount.toFixed(2)})`);
  }

  const cajeraSession = await getActiveSessionForUser(actor?.userId);
  if (!cajeraSession) throw new Error('Necesitas un turno de caja abierto para cobrar este pedido');

  const rows = lines.map((l) => {
    const m = methods.find((x) => x.id === l.paymentMethodId)!;
    const pct = roundMoney(toNum(m.retentionPercentage), 2);
    const rowTip = roundMoney(l.tipAmount || 0, 2);
    return {
      orderId,
      paymentMethodId: m.id,
      paymentMethod: m.name,
      amount: roundMoney(l.amount, 2).toFixed(2),
      tipAmount: rowTip.toFixed(2),
      isCash: m.isCash,
      retentionPercentage: pct.toFixed(2),
      retentionAmount: roundMoney((l.amount * pct) / 100, 2).toFixed(2),
      reference: l.reference?.trim().slice(0, 50) || null,
      createdById: actor?.userId ?? null,
    };
  });
  const totalRetention = roundMoney(rows.reduce((s, r) => s + toNum(r.retentionAmount), 0), 2);
  // % efectivo ponderado, solo informativo (el importe exacto es la suma por método)
  const weightedPct = baseAmount > 0 ? roundMoney((totalRetention / baseAmount) * 100, 2) : 0;

  const updated = await db.transaction(async (tx) => {
    await tx.insert(orderPayments).values(rows);
    const [u] = await tx
      .update(orders)
      .set({
        paymentStatus: 'paid',
        ...(order.status !== 'completed' ? { status: 'completed' as const } : {}),
        paymentMethod: MIXED_PAYMENT_LABEL,
        paymentMethodId: null,
        collectedSessionId: cajeraSession.id,
        retentionPercentage: weightedPct.toFixed(2),
        retentionAmount: totalRetention.toFixed(2),
        tipAmount: roundMoney(rows.reduce((s, r) => s + toNum(r.tipAmount), 0), 2).toFixed(2),
        total: baseAmount.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return u;
  });

  // Ingresos de caja: uno por método (fuera de la transacción, igual que el cobro simple:
  // un fallo aquí se registra pero no deshace el cobro).
  try {
    await recordOrderMultiPaymentIncome(
      orderId,
      rows.map((r) => ({
        amount: toNum(r.amount),
        tipAmount: toNum(r.tipAmount),
        paymentMethod: r.paymentMethod,
        isCash: r.isCash,
        retentionPercentage: r.retentionPercentage,
        retentionAmount: r.retentionAmount,
      })),
      actor,
    );
  } catch (e) {
    console.error('No se pudo registrar el ingreso de caja del pago mixto', orderId, e);
  }

  if (order.tableId) {
    await db.update(tables).set({
      statusCode: 'dirty',
      statusUpdatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tables.id, order.tableId));
  }

  return { order: updated, payments: rows };
}

export async function listOrderPayments(orderId: string) {
  const db = getTenantDb();
  return db.select().from(orderPayments).where(eq(orderPayments.orderId, orderId));
}

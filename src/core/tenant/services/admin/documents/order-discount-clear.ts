import { orders, orderItems } from '@/db/tenant/schema';
import { eq, and, gt } from 'drizzle-orm';
import type { TenantDb } from '@/utils/tenant-context';
import { toNum, roundMoney } from '../warehouse/shared/numbers';
import { resolveLineTaxes, type TaxConfig, type TaxSnapshotEntry } from '../../shared/taxes.service';

/**
 * Retira el descuento del pedido: devuelve a cada línea su parte prorrateada (total_price
 * e impuestos) y limpia los campos discount_* del pedido. NO recalcula los totales del
 * pedido: lo hace quien llama (aplicar descuento o la edición de ítems, que ya recalculan).
 * Devuelve true si había descuento.
 */
export async function clearOrderDiscount(db: TenantDb, orderId: string): Promise<boolean> {
  const [order] = await db
    .select({ discountAmount: orders.discountAmount, subtotal: orders.subtotal, total: orders.total })
    .from(orders).where(eq(orders.id, orderId));
  const lines = await db.select().from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), gt(orderItems.discountAmount, '0')));
  if (!order || (toNum(order.discountAmount) <= 0 && lines.length === 0)) return false;

  for (const line of lines) {
    const gross = roundMoney(toNum(line.totalPrice) + toNum(line.discountAmount), 2);
    const snapshot = line.taxSnapshot as TaxSnapshotEntry[] | null;
    await db.update(orderItems).set({
      totalPrice: gross.toFixed(2),
      discountAmount: '0.00',
      ...(snapshot?.length ? { taxSnapshot: resolveLineTaxes(gross, line.quantity, snapshot as TaxConfig[]).taxSnapshot as any } : {}),
    }).where(eq(orderItems.id, line.id));
  }

  // Devuelve lo restituido a subtotal/total: el pedido queda coherente aunque quien
  // llama no llegue a recalcular (p. ej. una edición que falla en su validación).
  const restored = roundMoney(lines.reduce((s, l) => s + toNum(l.discountAmount), 0), 2);
  await db.update(orders).set({
    subtotal: roundMoney(toNum(order.subtotal) + restored, 2).toFixed(2),
    total: roundMoney(toNum(order.total) + restored, 2).toFixed(2),
    discountAmount: '0.00',
    discountReasonId: null,
    discountMotivo: null,
    discountMode: null,
    discountValue: null,
    discountById: null,
    discountAt: null,
    updatedAt: new Date(),
  }).where(eq(orders.id, orderId));
  return true;
}

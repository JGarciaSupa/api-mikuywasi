import { paymentMethods, orders, orderSplits } from '@/db/tenant/schema';
import { eq, asc, or, isNull, ilike, count } from 'drizzle-orm';
import { getTenantDb, getTenantContext } from '@/utils/tenant-context';
import { InUseError } from '@/utils/errors';

/**
 * Busca un método de pago por nombre (case-insensitive). Devuelve la fila o null.
 * Se usa para resolver paymentMethodId + isCash al momento de cobrar.
 */
export async function findPaymentMethodByName(name?: string | null) {
  const n = (name ?? '').trim();
  if (!n) return null;
  const db = getTenantDb();
  const [pm] = await db.select().from(paymentMethods).where(ilike(paymentMethods.name, n)).limit(1);
  return pm ?? null;
}

/**
 * Obtener todos los métodos de pago de un tenant
 */
export async function getAllPaymentMethods(branchId?: number) {
  const db = getTenantDb();
  const query = db.select().from(paymentMethods);

  if (branchId) {
    return await query
      .where(or(eq(paymentMethods.branchId, branchId), isNull(paymentMethods.branchId)))
      .orderBy(asc(paymentMethods.name));
  }

  return await query.orderBy(asc(paymentMethods.name));
}

/**
 * Obtener un método de pago por ID
 */
export async function getPaymentMethodById(id: number) {
  const db = getTenantDb();
  const [paymentMethod] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
  return paymentMethod;
}

/**
 * Crear un nuevo método de pago
 */
export async function createPaymentMethod(data: any) {
  const db = getTenantDb();
  const [newPaymentMethod] = await db.insert(paymentMethods).values({
    ...data,
    retentionPercentage: (data.retentionPercentage ?? 0).toFixed(2),
    branchId: data.branchId ?? null,
  }).returning();
  return newPaymentMethod;
}

/**
 * Actualizar un método de pago existente
 */
export async function updatePaymentMethod(id: number, data: any) {
  const db = getTenantDb();
  const [updatedPaymentMethod] = await db
    .update(paymentMethods)
    .set({
      ...data,
      ...(data.retentionPercentage !== undefined
        ? { retentionPercentage: Number(data.retentionPercentage).toFixed(2) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(paymentMethods.id, id))
    .returning();
  return updatedPaymentMethod;
}

/**
 * Eliminar un método de pago
 */
export async function deletePaymentMethod(id: number, force = false) {
  const db = getTenantDb();

  const [existing] = await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.id, id));
  if (!existing) throw new Error('Método de pago no encontrado');

  // Contar referencias en pedidos y splits de pedidos.
  const [{ refs: orderRefs }] = await db.select({ refs: count() }).from(orders).where(eq(orders.paymentMethodId, id));
  const [{ refs: splitRefs }] = await db.select({ refs: count() }).from(orderSplits).where(eq(orderSplits.paymentMethodId, id));
  const refs = orderRefs + splitRefs;

  if (refs > 0 && !force) {
    throw new InUseError(
      `Este método de pago está asociado a ${refs} pedido(s). Si lo eliminas, esos pedidos conservarán el nombre del método pero perderán el vínculo. ¿Deseas eliminarlo de todas formas?`,
      refs,
    );
  }

  if (orderRefs > 0) await db.update(orders).set({ paymentMethodId: null }).where(eq(orders.paymentMethodId, id));
  if (splitRefs > 0) await db.update(orderSplits).set({ paymentMethodId: null }).where(eq(orderSplits.paymentMethodId, id));

  const [deletedPaymentMethod] = await db.delete(paymentMethods).where(eq(paymentMethods.id, id)).returning();
  return deletedPaymentMethod;
}

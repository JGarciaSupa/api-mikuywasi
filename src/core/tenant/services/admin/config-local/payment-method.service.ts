import { paymentMethods } from '@/db/tenant/schema';
import { eq, asc, or, isNull } from 'drizzle-orm';
import { getTenantDb, getTenantContext } from '@/utils/tenant-context';

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
export async function deletePaymentMethod(id: number) {
  const db = getTenantDb();
  const [deletedPaymentMethod] = await db
    .delete(paymentMethods)
    .where(eq(paymentMethods.id, id))
    .returning();
  return deletedPaymentMethod;
}

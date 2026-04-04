import { db } from '../../db';
import { paymentMethods } from '../../db/schema';
import { eq, asc } from 'drizzle-orm';

/**
 * Obtener todos los métodos de pago de un tenant
 */
export async function getAllPaymentMethods(tenantId: number) {
  return await db.select().from(paymentMethods)
    .where(eq(paymentMethods.tenantId, tenantId))
    .orderBy(asc(paymentMethods.name));
}

/**
 * Obtener un método de pago por ID
 */
export async function getPaymentMethodById(id: number) {
  const [paymentMethod] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
  return paymentMethod;
}

/**
 * Crear un nuevo método de pago
 */
export async function createPaymentMethod(data: any) {
  const [newPaymentMethod] = await db.insert(paymentMethods).values(data).returning();
  return newPaymentMethod;
}

/**
 * Actualizar un método de pago existente
 */
export async function updatePaymentMethod(id: number, data: any) {
  const [updatedPaymentMethod] = await db
    .update(paymentMethods)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(paymentMethods.id, id))
    .returning();
  return updatedPaymentMethod;
}

/**
 * Eliminar un método de pago
 */
export async function deletePaymentMethod(id: number) {
  const [deletedPaymentMethod] = await db
    .delete(paymentMethods)
    .where(eq(paymentMethods.id, id))
    .returning();
  return deletedPaymentMethod;
}

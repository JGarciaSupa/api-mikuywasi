import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { branches, orders } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { hasPermission, getCurrentUserId } from '@/utils/permissions';

// "Meseros solo ven sus mesas" (branches.waiters_own_tables_only, apagado por defecto): en esa
// sucursal, quien no tiene mozo.ver_todas_mesas (jefe de mozos, cajero, admin) solo ve el detalle
// y opera los pedidos de mesa en los que es el mozo asignado (orders.waiter_id).

export const FOREIGN_TABLE_MESSAGE = 'Esta mesa la atiende otro mozo';

/** Usuario restringido a sus mesas en `branchId`, o null si ve todas. */
export async function ownTablesScope(c: Context, branchId: number | null | undefined): Promise<number | null> {
  if (branchId == null || hasPermission(c, 'mozo.ver_todas_mesas')) return null;
  const userId = getCurrentUserId(c);
  if (!userId) return null;
  const db = getTenantDb();
  const [row] = await db.select({ only: branches.waitersOwnTablesOnly }).from(branches).where(eq(branches.id, branchId)).limit(1);
  return row?.only ? userId : null;
}

/**
 * Alcance del usuario sobre un pedido: `ownUserId` si está restringido a sus mesas en la sucursal
 * del pedido (si no, null) y `foreign` si el pedido es de mesa y lo atiende otro mozo.
 */
export async function orderTableScope(c: Context, orderId: string): Promise<{ ownUserId: number | null; foreign: boolean }> {
  const db = getTenantDb();
  const [order] = await db
    .select({ branchId: orders.branchId, waiterId: orders.waiterId, deliveryType: orders.deliveryType })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) return { ownUserId: null, foreign: false };
  const ownUserId = await ownTablesScope(c, order.branchId);
  return { ownUserId, foreign: ownUserId != null && order.deliveryType === 'dine_in' && order.waiterId !== ownUserId };
}

/** Bloquea ver u operar un pedido de mesa ajeno (param :id). */
export async function requireOwnTableOrder(c: Context, next: Next) {
  const orderId = c.req.param('id');
  if (orderId && (await orderTableScope(c, orderId)).foreign) {
    return c.json({ success: false, message: FOREIGN_TABLE_MESSAGE }, 403);
  }
  return next();
}

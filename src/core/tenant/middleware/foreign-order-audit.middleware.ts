import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { orders, cashSessions } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { hasPermission, getCurrentUserId } from '@/utils/permissions';
import { getActiveSessionForUser } from '../services/admin/documents/cash.service';
import { writeAuditLog } from '../services/admin/warehouse/shared/audit.service';

// Modo auditoría (2026-10-27): NO bloquea. Tras un cobro o emisión correctos, si quien
// operó no es dueño del pedido ni tiene pedidos.operar_otros, deja constancia en audit_log.
// Dueño = mismo criterio que el POS: mozo asignado, usuario del turno que lo generó, o el
// turno abierto del usuario es el del pedido o al que se transfirió. Con datos reales se
// decidirá si pasar a bloqueo.

type OrderIdResolver = (c: Context) => Promise<string | null | undefined> | string | null | undefined;

async function isOrderOwner(orderId: string, userId: number): Promise<boolean | null> {
  const db = getTenantDb();
  const [row] = await db
    .select({
      waiterId: orders.waiterId,
      cashSessionId: orders.cashSessionId,
      transferredSessionId: orders.transferredSessionId,
      sessionUserId: cashSessions.userId,
    })
    .from(orders)
    .leftJoin(cashSessions, eq(cashSessions.id, orders.cashSessionId))
    .where(eq(orders.id, orderId));
  if (!row) return null;

  if (row.waiterId === userId || row.sessionUserId === userId) return true;
  const session = await getActiveSessionForUser(userId);
  return !!session && (session.id === row.cashSessionId || session.id === row.transferredSessionId);
}

export function auditForeignOrder(action: string, resolveOrderId: OrderIdResolver) {
  return async (c: Context, next: Next) => {
    await next();

    try {
      if (c.res.status >= 400) return;
      if (hasPermission(c, 'pedidos.operar_otros')) return;
      const userId = getCurrentUserId(c);
      const orderId = await resolveOrderId(c);
      if (!userId || !orderId) return;

      const owner = await isOrderOwner(orderId, userId);
      if (owner !== false) return;

      await writeAuditLog({
        tableName: 'orders',
        operation: 'UPDATE',
        recordId: null,
        afterData: { orderId, action, ownershipCheck: 'foreign_order_without_permission' },
        userId,
        module: 'pedidos',
        description: `${action} del pedido ${orderId} por un usuario que no es su dueño y no tiene pedidos.operar_otros (no bloqueado: modo auditoría)`,
      });
    } catch (e) {
      console.error('[auditForeignOrder] no se pudo registrar la auditoría', e);
    }
  };
}

export const orderIdFromParam = (name: string) => (c: Context) => c.req.param(name);

export const orderIdFromJsonBody = async (c: Context) => {
  const body = await c.req.json().catch(() => null) as { orderId?: unknown } | null;
  return typeof body?.orderId === 'string' ? body.orderId : null;
};

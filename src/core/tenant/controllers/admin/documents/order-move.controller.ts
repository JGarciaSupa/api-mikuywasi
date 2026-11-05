import type { Context } from 'hono';
import * as moveService from '../../../services/admin/documents/order-move.service';
import { getCurrentUserId } from '@/utils/permissions';
import { FOREIGN_TABLE_MESSAGE, orderTableScope } from '../../../middleware/waiter-scope.middleware';

const getIp = (c: Context) => c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? null;

// PATCH /orders/:id/move-to-table  { targetTableId, items?: [{ orderItemId, quantity }] }
export const moveOrderToTableController = async (c: Context) => {
  try {
    const userId = getCurrentUserId(c);
    if (!userId) return c.json({ success: false, message: 'Usuario no autenticado' }, 401);

    const orderId = c.req.param('id');
    if (!orderId) return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    const body = await c.req.json();
    const targetTableId = Number(body?.targetTableId);
    if (!targetTableId || isNaN(targetTableId)) {
      return c.json({ success: false, message: 'targetTableId es requerido' }, 400);
    }
    const items = Array.isArray(body?.items)
      ? body.items
          .map((i: any) => ({ orderItemId: Number(i?.orderItemId), quantity: Number(i?.quantity) }))
          .filter((i: any) => i.orderItemId && i.quantity > 0)
      : undefined;

    // "Meseros solo ven sus mesas": solo mueve sus pedidos y no a una mesa que atiende otro mozo
    const scope = await orderTableScope(c, orderId);
    if (scope.foreign) return c.json({ success: false, message: FOREIGN_TABLE_MESSAGE }, 403);

    const data = await moveService.moveOrderToTable({ orderId, targetTableId, items, userId, ownWaiterId: scope.ownUserId, ip: getIp(c) });
    return c.json({ success: true, message: 'Pedido movido', data });
  } catch (error: any) {
    const msg = error.message || 'Error al mover el pedido';
    const status = /turno de caja abierto/i.test(msg) ? 409
      : /no está habilitado|otra sucursal|inhabilitada|transferido|otro mozo/i.test(msg) ? 403
      : /no encontrad[oa]/i.test(msg) ? 404
      : 400;
    return c.json({ success: false, message: msg }, status);
  }
};

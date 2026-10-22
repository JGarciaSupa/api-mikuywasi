import { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import * as voidTicketService from '../../../services/admin/documents/order-void-ticket.service';

// GET /orders/:id/void-ticket?branchId=X[&itemId=Y]
export async function getOrderVoidTicketController(c: Context) {
  try {
    const orderId = c.req.param('id');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const branchId = Number(c.req.query('branchId'));
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return c.json({ success: false, message: 'branchId es requerido' }, 400);
    }
    const itemIdStr = c.req.query('itemId');
    const itemId = itemIdStr != null ? Number(itemIdStr) : undefined;
    if (itemId != null && (!Number.isInteger(itemId) || itemId <= 0)) {
      return c.json({ success: false, message: 'itemId inválido' }, 400);
    }
    const data = await voidTicketService.getOrderVoidTicketPayload(orderId, branchId, itemId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener el ticket de anulación') }, 400);
  }
}

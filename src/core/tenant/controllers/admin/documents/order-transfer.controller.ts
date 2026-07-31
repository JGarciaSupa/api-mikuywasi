import type { Context } from 'hono';
import * as transferService from '../../../services/admin/documents/order-transfer.service';
import { getCurrentUserId } from '@/utils/permissions';

const getIp = (c: Context) => c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? null;

// GET /orders/transferable?search=... — pedidos que el cajero puede transferir.
export const listTransferableOrdersController = async (c: Context) => {
  try {
    const userId = getCurrentUserId(c);
    if (!userId) return c.json({ success: false, message: 'Usuario no autenticado' }, 401);
    const search = c.req.query('search') || undefined;
    const data = await transferService.listTransferableOrders(userId, search);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al listar pedidos transferibles' }, 500);
  }
};

// POST /orders/:id/transfer — transferir el pedido a la caja del cajero.
export const transferOrderController = async (c: Context) => {
  try {
    const userId = getCurrentUserId(c);
    if (!userId) return c.json({ success: false, message: 'Usuario no autenticado' }, 401);
    const id = c.req.param('id');
    const data = await transferService.transferOrder(id, userId, getIp(c));
    return c.json({ success: true, message: 'Pedido transferido a tu caja', data });
  } catch (error: any) {
    const msg = error.message || 'Error al transferir el pedido';
    const status = /turno de caja abierto/i.test(msg) ? 409
      : /no están habilitadas|no tiene una caja/i.test(msg) ? 403
      : /no encontrado/i.test(msg) ? 404
      : 400;
    return c.json({ success: false, message: msg }, status);
  }
};

// POST /orders/:id/return — regresar el pedido (desbloquear) al mozo.
export const returnOrderController = async (c: Context) => {
  try {
    const userId = getCurrentUserId(c);
    if (!userId) return c.json({ success: false, message: 'Usuario no autenticado' }, 401);
    const id = c.req.param('id');
    const data = await transferService.returnOrder(id, userId, getIp(c));
    return c.json({ success: true, message: 'Pedido regresado', data });
  } catch (error: any) {
    const msg = error.message || 'Error al regresar el pedido';
    const status = /no encontrado/i.test(msg) ? 404 : 400;
    return c.json({ success: false, message: msg }, status);
  }
};

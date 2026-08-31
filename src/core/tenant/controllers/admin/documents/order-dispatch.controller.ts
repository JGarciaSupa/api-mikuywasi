import { Context } from 'hono';
import * as dispatchService from '../../../services/admin/documents/order-dispatch.service';

export async function getOrderDispatchPayloadController(c: Context) {
  try {
    const orderId = c.req.param('id');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const branchIdStr = c.req.query('branchId');
    if (!branchIdStr) {
      return c.json({ success: false, message: 'branchId es requerido' }, 400);
    }
    const branchId = Number(branchIdStr);
    const data = await dispatchService.getOrderDispatchPayload(orderId, branchId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener payload de despacho' }, 500);
  }
}

export async function markOrderItemsDispatchedController(c: Context) {
  try {
    const orderId = c.req.param('id');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const body = await c.req.json<{ itemIds?: number[] }>();
    if (!body || !Array.isArray(body.itemIds) || body.itemIds.length === 0) {
      return c.json({ success: false, message: 'itemIds es requerido como arreglo no vacío' }, 400);
    }
    const result = await dispatchService.markOrderItemsDispatched(orderId, body.itemIds);
    return c.json({ success: true, message: 'Ítems marcados como despachados a cocina', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al marcar ítems como despachados' }, 500);
  }
}

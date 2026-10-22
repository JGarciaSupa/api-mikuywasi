import { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import { getAuditActor } from '@/utils/helpers';
import * as discountService from '../../../services/admin/documents/order-discount.service';
import type { ApplyDiscountBody } from '../../../validations/admin/config-local/order-discount.validation';

// POST /waiter/orders/:id/discount — aplica (o reemplaza) el descuento del pedido
export async function applyOrderDiscountController(c: Context) {
  try {
    const orderId = c.req.param('id');
    if (!orderId) return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    const body = c.req.valid('json' as never) as ApplyDiscountBody;
    const data = await discountService.applyOrderDiscount(orderId, body, getAuditActor(c));
    return c.json({ success: true, data, message: 'Descuento aplicado' });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al aplicar el descuento') }, 400);
  }
}

// DELETE /waiter/orders/:id/discount — quita el descuento del pedido
export async function removeOrderDiscountController(c: Context) {
  try {
    const orderId = c.req.param('id');
    if (!orderId) return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    const data = await discountService.removeOrderDiscount(orderId);
    return c.json({ success: true, data, message: 'Descuento retirado' });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al quitar el descuento') }, 400);
  }
}

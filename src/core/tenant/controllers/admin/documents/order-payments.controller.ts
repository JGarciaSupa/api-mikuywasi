import { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import { getAuditActor } from '@/utils/helpers';
import * as orderPaymentsService from '../../../services/admin/documents/order-payments.service';
import type { MultiPaymentInput } from '../../../validations/admin/config-local/order-payments.validation';

// POST /waiter/orders/:id/payments — cobro con varios métodos de pago (pago mixto)
export async function payOrderWithMultiplePaymentsController(c: Context) {
  try {
    const orderId = c.req.param('id');
    if (!orderId) return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    const { payments } = c.req.valid('json' as never) as MultiPaymentInput;
    const data = await orderPaymentsService.payOrderWithMultiplePayments(orderId, payments, getAuditActor(c));
    return c.json({ success: true, data, message: 'Pedido cobrado con pago mixto' });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al registrar el pago mixto') }, 400);
  }
}

// GET /waiter/orders/:id/payments — desglose del pago mixto (vacío si se cobró con un solo método)
export async function listOrderPaymentsController(c: Context) {
  try {
    const orderId = c.req.param('id');
    if (!orderId) return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    const data = await orderPaymentsService.listOrderPayments(orderId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener los pagos del pedido') }, 500);
  }
}

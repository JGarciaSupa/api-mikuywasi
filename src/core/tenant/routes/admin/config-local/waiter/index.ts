import { Hono, type Context, type Next } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import { hasPermission } from '@/utils/permissions';
import {
  createWaiterOrderController,
  getWaiterMenuController,
  getWaiterTablesStatusController,
  editOrderItemController,
  cancelOrderController,
  annulOrderItemController,
  getWaiterOrderController,
  updateWaiterOrderStatusController,
  updateWaiterOrderPaymentStatusController,
  updateWaiterOrderWaiterController,
} from '../../../../controllers/admin/config-local/waiter.controller';
import { validateCreateOrderFromToken } from '../../../../validations/client/order.validation';
import { payOrderWithMultiplePaymentsController, listOrderPaymentsController } from '../../../../controllers/admin/documents/order-payments.controller';
import { validateMultiPayment } from '../../../../validations/admin/config-local/order-payments.validation';
import { applyOrderDiscountController, removeOrderDiscountController } from '../../../../controllers/admin/documents/order-discount.controller';
import { validateApplyDiscount } from '../../../../validations/admin/config-local/order-discount.validation';

const routes = new Hono();

// Anular un pedido completo: el mozo con su permiso o quien tenga pedidos.anular
const canCancelOrder = async (c: Context, next: Next) => {
  if (hasPermission(c, 'mozo.cancelar_pedido') || hasPermission(c, 'pedidos.anular')) return next();
  return c.json({ success: false, message: 'No tienes permisos para anular pedidos' }, 403);
};

routes.use('*', authMiddleware);

routes.get('/menu', getWaiterMenuController);
routes.get('/tables/status', getWaiterTablesStatusController);
routes.post('/orders', validateCreateOrderFromToken, createWaiterOrderController);
routes.get('/orders/:id', getWaiterOrderController);
routes.patch('/orders/:id/status', updateWaiterOrderStatusController);
routes.patch('/orders/:id/payment-status', updateWaiterOrderPaymentStatusController);
routes.get('/orders/:id/payments', listOrderPaymentsController);
routes.post('/orders/:id/payments', validateMultiPayment, payOrderWithMultiplePaymentsController);
routes.post('/orders/:id/discount', requirePermission('pedidos', 'pedidos.cambiar_estado_pago'), validateApplyDiscount, applyOrderDiscountController);
routes.delete('/orders/:id/discount', requirePermission('pedidos', 'pedidos.cambiar_estado_pago'), removeOrderDiscountController);
routes.patch('/orders/:id/waiter', updateWaiterOrderWaiterController);
routes.patch('/orders/:id/items', editOrderItemController);
routes.post('/orders/:id/items/:itemId/annul', annulOrderItemController);
routes.post('/orders/:id/cancel', canCancelOrder, cancelOrderController);

export default routes;

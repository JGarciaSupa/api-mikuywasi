import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import { auditForeignOrder, orderIdFromParam } from '../../../../middleware/foreign-order-audit.middleware';
import { requireOwnTableOrder } from '../../../../middleware/waiter-scope.middleware';
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
  updateWaiterOrderPaxController,
} from '../../../../controllers/admin/config-local/waiter.controller';
import { validateCreateOrderFromToken } from '../../../../validations/client/order.validation';
import { payOrderWithMultiplePaymentsController, listOrderPaymentsController } from '../../../../controllers/admin/documents/order-payments.controller';
import { validateMultiPayment } from '../../../../validations/admin/config-local/order-payments.validation';
import { applyOrderDiscountController, removeOrderDiscountController } from '../../../../controllers/admin/documents/order-discount.controller';
import { validateApplyDiscount } from '../../../../validations/admin/config-local/order-discount.validation';
import { giveOrderCourtesyController, giveItemCourtesyController, removeItemCourtesyController } from '../../../../controllers/admin/documents/courtesy.controller';
import { validateCourtesy } from '../../../../validations/admin/config-local/courtesy.validation';

const routes = new Hono();

routes.use('*', authMiddleware);
// "Meseros solo ven sus mesas": un pedido de mesa ajeno no se abre ni se opera
routes.use('/orders/:id', requireOwnTableOrder);
routes.use('/orders/:id/*', requireOwnTableOrder);

routes.get('/menu', getWaiterMenuController);
routes.get('/tables/status', getWaiterTablesStatusController);
routes.post('/orders', validateCreateOrderFromToken, createWaiterOrderController);
routes.get('/orders/:id', getWaiterOrderController);
routes.patch('/orders/:id/status', updateWaiterOrderStatusController);
routes.patch('/orders/:id/payment-status', updateWaiterOrderPaymentStatusController);
routes.get('/orders/:id/payments', listOrderPaymentsController);
routes.post('/orders/:id/payments', auditForeignOrder('Cobro', orderIdFromParam('id')), validateMultiPayment, payOrderWithMultiplePaymentsController);
routes.post('/orders/:id/discount', requirePermission('pedidos', 'pedidos.cambiar_estado_pago'), validateApplyDiscount, applyOrderDiscountController);
routes.delete('/orders/:id/discount', requirePermission('pedidos', 'pedidos.cambiar_estado_pago'), removeOrderDiscountController);
// Cortesías (motivo del catálogo + contraseña de supervisor, salvo seguridad.cortesia_sin_contrasena)
const canGiveCourtesy = requirePermission('pedidos', 'pedidos.cortesia');
routes.post('/orders/:id/courtesy', canGiveCourtesy, validateCourtesy, giveOrderCourtesyController);
routes.post('/orders/:id/items/:itemId/courtesy', canGiveCourtesy, validateCourtesy, giveItemCourtesyController);
routes.delete('/orders/:id/items/:itemId/courtesy', canGiveCourtesy, removeItemCourtesyController);
routes.patch('/orders/:id/waiter', updateWaiterOrderWaiterController);
routes.patch('/orders/:id/pax', updateWaiterOrderPaxController);
routes.patch('/orders/:id/items', editOrderItemController);
routes.post('/orders/:id/items/:itemId/annul', annulOrderItemController);
// Anular un pedido completo: con mozo.cancelar_pedido o pedidos.anular; sin ellos, exige la
// autorización de un supervisor (contraseña o código por WhatsApp). Lo resuelve el controller.
routes.post('/orders/:id/cancel', cancelOrderController);

export default routes;

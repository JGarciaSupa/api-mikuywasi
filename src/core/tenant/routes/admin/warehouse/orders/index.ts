import {
  getOrderDispatchPayloadController,
  markOrderItemsDispatchedController,
} from '../../../../controllers/admin/documents/order-dispatch.controller';
import { getOrderVoidTicketController } from '../../../../controllers/admin/documents/order-void-ticket.controller';
import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import {
  getOrdersController,
  getOrderByIdController,
  updateOrderStatusController,
  updateOrderPaymentStatusController,
  updateOrderPaymentMethodController,
  getOrderStatsController,
  updateOrderCustomerController,
  updateOrderNotesController,
  updateOrderForController
} from '../../../../controllers/admin/documents/order.controller';
import {
  listTransferableOrdersController,
  transferOrderController,
  returnOrderController,
} from '../../../../controllers/admin/documents/order-transfer.controller';
import { moveOrderToTableController } from '../../../../controllers/admin/documents/order-move.controller';
import {
  getOrdersReportSummaryController,
  getOrdersReportBreakdownController,
  getOrdersReportProductsController,
  getOrdersReportExportController,
} from '../../../../controllers/admin/documents/order-reports.controller';
import {
  listSplitsController,
  createSplitController,
  createEqualSplitsController,
  createCustomAmountSplitsController,
  updateSplitLabelController,
  assignItemsController,
  splitItemQtyController,
  updateSplitPaymentController,
  deleteSplitController,
} from '../../../../controllers/admin/documents/order-splits.controller';

const routes = new Hono();

// Middlewares de seguridad globales para el módulo de órdenes
routes.use('*', authMiddleware);

// Endpoints
routes.get('/', getOrdersController);
routes.get('/stats', getOrderStatsController);

// Transferencia de pedidos a caja (activación ENABLE_ORDER_TRANSFER + permiso pedidos.transferir).
// Registrado antes de /:id para no colisionar.
routes.get('/transferable', requirePermission('pedidos', 'pedidos.transferir'), listTransferableOrdersController);
routes.post('/:id/transfer', requirePermission('pedidos', 'pedidos.transferir'), transferOrderController);
routes.post('/:id/return', requirePermission('pedidos', 'pedidos.transferir'), returnOrderController);
routes.patch('/:id/move-to-table', requirePermission('pedidos', 'pedidos.mover_mesa'), moveOrderToTableController);

// Reportes agregados (registrados antes de /:id para no colisionar)
routes.get('/reports/summary', getOrdersReportSummaryController);
routes.get('/reports/breakdown', getOrdersReportBreakdownController);
routes.get('/reports/products', getOrdersReportProductsController);
routes.get('/reports/export', getOrdersReportExportController);

// Despacho a cocina e impresión física
routes.get('/:id/dispatch-payload', getOrderDispatchPayloadController);
routes.post('/:id/mark-dispatched', markOrderItemsDispatchedController);
routes.get('/:id/void-ticket', getOrderVoidTicketController);

routes.get('/:id', getOrderByIdController);
routes.patch('/:id/status', updateOrderStatusController);
routes.patch('/:id/payment-status', updateOrderPaymentStatusController);
routes.patch('/:id/payment-method', updateOrderPaymentMethodController);
routes.patch('/:id/customer', updateOrderCustomerController);
routes.patch('/:id/notes', updateOrderNotesController);
routes.patch('/:id/order-for', updateOrderForController);

// Cuentas separadas (splits)
routes.get('/:orderId/splits', listSplitsController);
routes.post('/:orderId/splits', createSplitController);
routes.post('/:orderId/splits/equal', createEqualSplitsController);
routes.post('/:orderId/splits/by-amount', createCustomAmountSplitsController);
routes.patch('/:orderId/splits/:splitId/label', updateSplitLabelController);
routes.patch('/:orderId/splits/items', assignItemsController);
routes.post('/:orderId/splits/items/split-qty', splitItemQtyController);
routes.patch('/:orderId/splits/:splitId/payment', updateSplitPaymentController);
routes.delete('/:orderId/splits/:splitId', deleteSplitController);

export default routes;

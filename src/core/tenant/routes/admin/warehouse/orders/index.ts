import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  getOrdersController,
  getOrderByIdController,
  updateOrderStatusController,
  updateOrderPaymentStatusController,
  getOrderStatsController
} from '../../../../controllers/admin/documents/order.controller';
import {
  listSplitsController,
  createSplitController,
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
routes.get('/:id', getOrderByIdController);
routes.patch('/:id/status', updateOrderStatusController);
routes.patch('/:id/payment-status', updateOrderPaymentStatusController);

// Cuentas separadas (splits)
routes.get('/:orderId/splits', listSplitsController);
routes.post('/:orderId/splits', createSplitController);
routes.patch('/:orderId/splits/:splitId/label', updateSplitLabelController);
routes.patch('/:orderId/splits/items', assignItemsController);
routes.post('/:orderId/splits/items/split-qty', splitItemQtyController);
routes.patch('/:orderId/splits/:splitId/payment', updateSplitPaymentController);
routes.delete('/:orderId/splits/:splitId', deleteSplitController);

export default routes;

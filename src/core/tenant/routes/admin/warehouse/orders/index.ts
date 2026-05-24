import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../../middleware/auth.middleware';
import {
  getOrdersController,
  getOrderByIdController,
  updateOrderStatusController,
  updateOrderPaymentStatusController,
  getOrderStatsController
} from '../../../../controllers/admin/documents/order.controller';

const routes = new Hono();

// Middlewares de seguridad globales para el módulo de órdenes
routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin', 'kitchen']));

// Endpoints
routes.get('/', getOrdersController);
routes.get('/stats', getOrderStatsController);
routes.get('/:id', getOrderByIdController);
routes.patch('/:id/status', updateOrderStatusController);
routes.patch('/:id/payment-status', updateOrderPaymentStatusController);

export default routes;

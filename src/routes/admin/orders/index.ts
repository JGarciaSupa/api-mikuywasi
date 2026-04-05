import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';
import {
  getOrdersController,
  getOrderByIdController,
  updateOrderStatusController,
  updateOrderPaymentStatusController,
  getOrderStatsController
} from '../../../controllers/admin/order.controller';

const routes = new Hono();

// Rate limiter específico para órdenes (100 peticiones por minuto)
const ordersLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

// Middlewares de seguridad globales para el módulo de órdenes
routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

// Endpoints
routes.get('/', ordersLimiter, getOrdersController);
routes.get('/stats', ordersLimiter, getOrderStatsController);
routes.get('/:id', ordersLimiter, getOrderByIdController);
routes.patch('/:id/status', ordersLimiter, updateOrderStatusController);
routes.patch('/:id/payment-status', ordersLimiter, updateOrderPaymentStatusController);

export default routes;

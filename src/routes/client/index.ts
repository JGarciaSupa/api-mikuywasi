import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';
import { getTenantBySlugController, getMenuByCategoryController, getTablesByTenantSlugController, getPaymentMethodsByTenantSlugController } from '../../controllers/client/tenant.controller';
import { createOrderController } from '../../controllers/client/order.controller';
import { validateCreateOrder } from '../../validations/client/order.validation';

const routes = new Hono();

const clientLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiadas peticiones, intente de nuevo en 1 minuto'
  }
});

// Tenant Endpoints
routes.get('/tenant/:slug', clientLimiter, getTenantBySlugController);
routes.get('/menu/:slug', clientLimiter, getMenuByCategoryController);
routes.get('/tables/:slug', clientLimiter, getTablesByTenantSlugController);
routes.get('/payment-methods/:slug', clientLimiter, getPaymentMethodsByTenantSlugController);

// Order Endpoints
routes.post('/orders', clientLimiter, validateCreateOrder, createOrderController);

export default routes;
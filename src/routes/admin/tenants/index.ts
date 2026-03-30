import { Hono } from 'hono';
import { authMiddleware } from '../../../middleware/auth.middleware';
import { validateCreateTenant, validateUpdateTenant, validateRenewSubscription } from '../../../validations/admin/tenant.validation';
import { createTenantController, getAllTenantsController, updateTenantController, renewSubscriptionController } from '../../../controllers/admin/tenants.controller';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';

const routes = new Hono();

const tenantsLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('*', authMiddleware);

routes.get('/', tenantsLimiter, getAllTenantsController);
routes.post('/', tenantsLimiter, validateCreateTenant, createTenantController);
routes.patch('/:id', tenantsLimiter, validateUpdateTenant, updateTenantController);
routes.post('/:id/renew', tenantsLimiter, validateRenewSubscription, renewSubscriptionController);

export default routes;

import { Hono } from 'hono';
import { authMiddleware } from '../../../middleware/auth.middleware';
import { validateCreateTenant, validateUpdateTenant, validateRenewSubscription } from '../../../validations/admin/tenant.validation';
import { validateCreateTenantUser } from '../../../validations/admin/user.validation';
import { 
  createTenantController, 
  getAllTenantsController, 
  updateTenantController, 
  renewSubscriptionController,
  getTenantByIdController,
  getTenantUsersController,
  createTenantUserController
} from '../../../controllers/admin/tenants.controller';
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
routes.get('/:id', tenantsLimiter, getTenantByIdController);
routes.patch('/:id', tenantsLimiter, validateUpdateTenant, updateTenantController);
routes.post('/:id/renew', tenantsLimiter, validateRenewSubscription, renewSubscriptionController);

// User management for tenants
routes.get('/:id/users', tenantsLimiter, getTenantUsersController);
routes.post('/:id/users', tenantsLimiter, validateCreateTenantUser, createTenantUserController);

export default routes;

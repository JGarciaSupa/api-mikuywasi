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

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', getAllTenantsController);
routes.post('/', validateCreateTenant, createTenantController);
routes.get('/:id', getTenantByIdController);
routes.patch('/:id', validateUpdateTenant, updateTenantController);
routes.post('/:id/renew', validateRenewSubscription, renewSubscriptionController);

// User management for tenants
routes.get('/:id/users', getTenantUsersController);
routes.post('/:id/users', validateCreateTenantUser, createTenantUserController);

export default routes;

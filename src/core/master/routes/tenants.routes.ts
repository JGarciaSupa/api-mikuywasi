import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import {
  validateCreateTenant,
  validateUpdateTenant,
  validateRenewSubscription,
} from '../validations/tenants.validation';
import {
  getAllTenantsController,
  getTenantByIdController,
  getTenantBySlugController,
  createTenantController,
  updateTenantController,
  renewSubscriptionController,
  deleteTenantController,
} from '../controllers/tenants.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllTenantsController);
router.post('/', validateCreateTenant, createTenantController);
router.get('/slug/:slug', getTenantBySlugController);
router.get('/:id', getTenantByIdController);
router.patch('/:id', validateUpdateTenant, updateTenantController);
router.post('/:id/renew', validateRenewSubscription, renewSubscriptionController);
router.delete('/:id', deleteTenantController);

export default router;

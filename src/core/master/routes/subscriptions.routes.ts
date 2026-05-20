import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateUpdateSubscription } from '../validations/subscriptions.validation';
import {
  getAllSubscriptionsController,
  getSubscriptionByIdController,
  getSubscriptionsByTenantController,
  updateSubscriptionController,
  cancelSubscriptionController,
} from '../controllers/subscriptions.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllSubscriptionsController);
router.get('/tenant/:tenantId', getSubscriptionsByTenantController);
router.get('/:id', getSubscriptionByIdController);
router.patch('/:id', validateUpdateSubscription, updateSubscriptionController);
router.post('/:id/cancel', cancelSubscriptionController);

export default router;

import { Hono } from 'hono';
import { authMiddleware } from '../../../middleware/auth.middleware';
import {
  validateCreatePlan,
  validateUpdatePlan,
  validateReorderPlans
} from '../../../validations/admin/plans.validation';
import {
  getAllPlansController,
  createPlanController,
  updatePlanController,
  softDeletePlanController,
  updateVisibilityController,
  reorderPlansController
} from '../../../controllers/admin/plans.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', getAllPlansController);
routes.post('/', validateCreatePlan, createPlanController);
routes.patch('/reorder', validateReorderPlans, reorderPlansController);
routes.patch('/:id', validateUpdatePlan, updatePlanController);
routes.delete('/:id', softDeletePlanController);
routes.patch('/:id/visibility', updateVisibilityController);

export default routes;

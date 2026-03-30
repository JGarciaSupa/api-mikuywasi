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
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';

const routes = new Hono();

const plansLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('*', authMiddleware);

routes.get('/', plansLimiter, getAllPlansController);
routes.post('/', plansLimiter, validateCreatePlan, createPlanController);
routes.patch('/reorder', plansLimiter, validateReorderPlans, reorderPlansController);
routes.patch('/:id', plansLimiter, validateUpdatePlan, updatePlanController);
routes.delete('/:id', plansLimiter, softDeletePlanController);
routes.patch('/:id/visibility', plansLimiter, updateVisibilityController);

export default routes;

import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateCreatePlan, validateUpdatePlan } from '../validations/plans.validation';
import {
  getAllPlansController,
  getPlanByIdController,
  createPlanController,
  updatePlanController,
  deletePlanController,
} from '../controllers/plans.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllPlansController);
router.post('/', validateCreatePlan, createPlanController);
router.get('/:id', getPlanByIdController);
router.patch('/:id', validateUpdatePlan, updatePlanController);
router.delete('/:id', deletePlanController);

export default router;

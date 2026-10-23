import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateCreatePlanFeature, validateUpdatePlanFeature } from '../validations/plan-features.validation';
import {
  getAllPlanFeaturesController,
  createPlanFeatureController,
  updatePlanFeatureController,
  deletePlanFeatureController,
} from '../controllers/plan-features.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllPlanFeaturesController);
router.post('/', validateCreatePlanFeature, createPlanFeatureController);
router.patch('/:id', validateUpdatePlanFeature, updatePlanFeatureController);
router.delete('/:id', deletePlanFeatureController);

export default router;

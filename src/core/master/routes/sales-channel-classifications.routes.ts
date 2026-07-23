import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateCreateSalesChannelClassification, validateUpdateSalesChannelClassification } from '../validations/sales-channel-classifications.validation';
import {
  getAllClassificationsController,
  getClassificationByCodeController,
  createClassificationController,
  updateClassificationController,
  deleteClassificationController,
} from '../controllers/sales-channel-classifications.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllClassificationsController);
router.post('/', validateCreateSalesChannelClassification, createClassificationController);
router.get('/:code', getClassificationByCodeController);
router.patch('/:code', validateUpdateSalesChannelClassification, updateClassificationController);
router.delete('/:code', deleteClassificationController);

export default router;

import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateCreateLocal, validateUpdateLocal } from '../validations/locales.validation';
import {
  getLocalesByBrandController,
  getLocalByIdController,
  createLocalController,
  updateLocalController,
  deleteLocalController,
} from '../controllers/locales.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getLocalesByBrandController); // ?brandId=X
router.post('/', validateCreateLocal, createLocalController);
router.get('/:id', getLocalByIdController);
router.patch('/:id', validateUpdateLocal, updateLocalController);
router.delete('/:id', deleteLocalController);

export default router;

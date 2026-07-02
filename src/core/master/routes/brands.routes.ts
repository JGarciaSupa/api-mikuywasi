import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateCreateBrand, validateUpdateBrand } from '../validations/brands.validation';
import {
  getBrandsByTenantController,
  getBrandByIdController,
  createBrandController,
  updateBrandController,
  deleteBrandController,
} from '../controllers/brands.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getBrandsByTenantController); // ?tenantId=X
router.post('/', validateCreateBrand, createBrandController);
router.get('/:id', getBrandByIdController);
router.patch('/:id', validateUpdateBrand, updateBrandController);
router.delete('/:id', deleteBrandController);

export default router;

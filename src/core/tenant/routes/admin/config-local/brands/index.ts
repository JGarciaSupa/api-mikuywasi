import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreateBrand,
  validateUpdateBrand,
} from '../../../../validations/admin/config-local/brands.validation';
import {
  getAllBrandsController,
  getBrandByIdController,
  createBrandController,
  updateBrandController,
  deleteBrandController,
  updateBrandLogoController,
  deleteBrandLogoController,
} from '../../../../controllers/admin/config-local/brands.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', getAllBrandsController);
routes.get('/:id', getBrandByIdController);
routes.post('/', validateCreateBrand, createBrandController);
routes.patch('/:id', validateUpdateBrand, updateBrandController);
routes.delete('/:id', deleteBrandController);
routes.post('/:id/logo', updateBrandLogoController);
routes.delete('/:id/logo', deleteBrandLogoController);

export default routes;

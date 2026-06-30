import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
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
routes.post('/', createBrandController);
routes.patch('/:id', updateBrandController);
routes.delete('/:id', deleteBrandController);
routes.post('/:id/logo', updateBrandLogoController);
routes.delete('/:id/logo', deleteBrandLogoController);

export default routes;

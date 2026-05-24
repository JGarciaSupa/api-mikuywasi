import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreateProduct,
  validateUpdateProduct
} from '../../../../validations/admin/products.validation';
import {
  createProductController,
  deleteProductController,
  getAllProductsController,
  getProductByIdController,
  updateProductController
} from '../../../../controllers/admin/warehouse/products.controller';

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', getAllProductsController);
routes.post('/', validateCreateProduct, createProductController);
routes.get('/:id', getProductByIdController);
routes.patch('/:id', validateUpdateProduct, updateProductController);
routes.delete('/:id', deleteProductController);

export default routes;

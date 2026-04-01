import { Hono } from 'hono';
import { authMiddleware } from '../../../middleware/auth.middleware';
import { 
  validateCreateProduct, 
  validateUpdateProduct 
} from '../../../validations/admin/products.validation';
import { 
  createProductController, 
  deleteProductController, 
  getAllProductsController, 
  getProductByIdController, 
  updateProductController 
} from '../../../controllers/admin/products.controller';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';

const routes = new Hono();

const productsLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('*', authMiddleware);

routes.get('/', productsLimiter, getAllProductsController);
routes.post('/', productsLimiter, validateCreateProduct, createProductController);
routes.get('/:id', productsLimiter, getProductByIdController);
routes.patch('/:id', productsLimiter, validateUpdateProduct, updateProductController);
routes.delete('/:id', productsLimiter, deleteProductController);

export default routes;

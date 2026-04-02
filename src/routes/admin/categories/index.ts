import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { 
  validateCreateCategory, 
  validateReorderCategories, 
  validateUpdateCategory 
} from '../../../validations/admin/categories.validation';
import { 
  createCategoryController, 
  deleteCategoryController, 
  getAllCategoriesController, 
  getCategoryByIdController, 
  reorderCategoriesController, 
  updateCategoryController 
} from '../../../controllers/admin/categories.controller';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';

const routes = new Hono();

const categoriesLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', categoriesLimiter, getAllCategoriesController);
routes.post('/', categoriesLimiter, validateCreateCategory, createCategoryController);
routes.get('/:id', categoriesLimiter, getCategoryByIdController);
routes.patch('/:id', categoriesLimiter, validateUpdateCategory, updateCategoryController);
routes.delete('/:id', categoriesLimiter, deleteCategoryController);
routes.post('/reorder', categoriesLimiter, validateReorderCategories, reorderCategoriesController);

export default routes;

import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreateCategory,
  validateReorderCategories,
  validateUpdateCategory
} from '../../../../validations/admin/config-local/categories.validation';
import {
  createCategoryController,
  deleteCategoryController,
  getAllCategoriesController,
  getCategoryByIdController,
  getSubcategoriesController,
  reorderCategoriesController,
  updateCategoryController
} from '../../../../controllers/admin/config-local/categories.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', getAllCategoriesController);
routes.post('/', validateCreateCategory, createCategoryController);
routes.get('/:id', getCategoryByIdController);
routes.patch('/:id', validateUpdateCategory, updateCategoryController);
routes.delete('/:id', deleteCategoryController);
routes.post('/reorder', validateReorderCategories, reorderCategoriesController);
routes.get('/:parentId/subcategories', getSubcategoriesController);

export default routes;

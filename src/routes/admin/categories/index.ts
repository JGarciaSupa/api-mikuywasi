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

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', getAllCategoriesController);
routes.post('/', validateCreateCategory, createCategoryController);
routes.get('/:id', getCategoryByIdController);
routes.patch('/:id', validateUpdateCategory, updateCategoryController);
routes.delete('/:id', deleteCategoryController);
routes.post('/reorder', validateReorderCategories, reorderCategoriesController);

export default routes;

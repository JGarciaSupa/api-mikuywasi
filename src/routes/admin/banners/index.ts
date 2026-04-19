import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { 
  validateCreateBanner, 
  validateUpdateBanner, 
  validateReorderBanners 
} from '../../../validations/admin/banners.validation';
import { 
  createBannerController, 
  deleteBannerController, 
  getAllBannersController, 
  getBannerByIdController, 
  reorderBannersController, 
  updateBannerController 
} from '../../../controllers/admin/banners.controller';

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', getAllBannersController);
routes.post('/', validateCreateBanner, createBannerController);
routes.get('/:id', getBannerByIdController);
routes.patch('/:id', validateUpdateBanner, updateBannerController);
routes.delete('/:id', deleteBannerController);
routes.post('/reorder', validateReorderBanners, reorderBannersController);

export default routes;

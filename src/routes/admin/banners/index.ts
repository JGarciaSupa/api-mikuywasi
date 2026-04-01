import { Hono } from 'hono';
import { authMiddleware } from '../../../middleware/auth.middleware';
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
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';

const routes = new Hono();

const bannersLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('*', authMiddleware);

routes.get('/', bannersLimiter, getAllBannersController);
routes.post('/', bannersLimiter, validateCreateBanner, createBannerController);
routes.get('/:id', bannersLimiter, getBannerByIdController);
routes.patch('/:id', bannersLimiter, validateUpdateBanner, updateBannerController);
routes.delete('/:id', bannersLimiter, deleteBannerController);
routes.post('/reorder', bannersLimiter, validateReorderBanners, reorderBannersController);

export default routes;

import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { 
  validateStaffQuery,
  validateCreateStaff,
  validateUpdateStaff
} from '../../../validations/admin/staff.validation';
import {
  getStaffListController,
  createStaffController,
  updateStaffController,
  deleteStaffController
} from '../../../controllers/admin/staff.controller';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';

const routes = new Hono();

const staffLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('/*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', staffLimiter, validateStaffQuery, getStaffListController);
routes.post('/', staffLimiter, validateCreateStaff, createStaffController);
routes.patch('/:id', staffLimiter, validateUpdateStaff, updateStaffController);
routes.delete('/:id', staffLimiter, deleteStaffController);

export default routes;


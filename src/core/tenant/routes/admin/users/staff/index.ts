import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateStaffQuery,
  validateCreateStaff,
  validateUpdateStaff
} from '../../../../validations/admin/users/staff.validation';
import {
  getStaffListController,
  createStaffController,
  updateStaffController,
  deleteStaffController
} from '../../../../controllers/admin/users/staff.controller';

const routes = new Hono();

routes.use('/*', authMiddleware);

routes.get('/', validateStaffQuery, getStaffListController);
routes.post('/', validateCreateStaff, createStaffController);
routes.patch('/:id', validateUpdateStaff, updateStaffController);
routes.delete('/:id', deleteStaffController);

export default routes;


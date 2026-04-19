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

const routes = new Hono();

routes.use('/*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', validateStaffQuery, getStaffListController);
routes.post('/', validateCreateStaff, createStaffController);
routes.patch('/:id', validateUpdateStaff, updateStaffController);
routes.delete('/:id', deleteStaffController);

export default routes;


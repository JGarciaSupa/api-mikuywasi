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
import {
  getUserReportSummaryController,
  getUserReportRankingController,
} from '../../../../controllers/admin/users/user-reports.controller';

const routes = new Hono();

routes.use('/*', authMiddleware);

// Reportes por usuario (sin userId → usuario del token)
routes.get('/reports/summary', getUserReportSummaryController);
routes.get('/reports/ranking', getUserReportRankingController);

routes.get('/', validateStaffQuery, getStaffListController);
routes.post('/', validateCreateStaff, createStaffController);
routes.patch('/:id', validateUpdateStaff, updateStaffController);
routes.delete('/:id', deleteStaffController);

export default routes;


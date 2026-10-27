import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
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

// El listado lo usan el POS (mozos), almacén y RBAC: queda abierto. Alta, edición y baja exigen permiso.
const canManageStaff = requirePermission('administracion', 'administracion.gestionar_personal');

routes.use('/*', authMiddleware);

// Reportes por usuario (sin userId → usuario del token; el de otros usuarios exige ver_personal)
routes.get('/reports/summary', getUserReportSummaryController);
routes.get('/reports/ranking', requirePermission('administracion', 'administracion.ver_personal'), getUserReportRankingController);

routes.get('/', validateStaffQuery, getStaffListController);
routes.post('/', canManageStaff, validateCreateStaff, createStaffController);
routes.patch('/:id', canManageStaff, validateUpdateStaff, updateStaffController);
routes.delete('/:id', canManageStaff, deleteStaffController);

export default routes;


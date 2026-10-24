import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import {
  validateCreateTable,
  validatePositionTable,
  validateUpdateTable,
  validateStatusTable,
  validateBulkCreateTables
} from '../../../../validations/admin/config-local/tables.validation';

import {
  createTableController,
  deleteTableController,
  getAllTablesController,
  updateTableController,
  updateTablePositionController,
  updateTableStatusController,
  getTableStatusesController,
  bulkCreateTablesController
} from '../../../../controllers/admin/config-local/tables.controller';
import { importTablesController } from '../../../../controllers/admin/config-local/tables-import.controller';
import { validateImportTables } from '../../../../validations/admin/config-local/tables-import.validation';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/statuses', getTableStatusesController);
routes.get('/', requirePermission('menu', 'menu.ver_mesas'), getAllTablesController);
routes.post('/', requirePermission('menu', 'menu.gestionar_mesas'), validateCreateTable, createTableController);
routes.post('/bulk', requirePermission('menu', 'menu.gestionar_mesas'), validateBulkCreateTables, bulkCreateTablesController);
routes.post('/import', requirePermission('menu', 'menu.gestionar_mesas'), validateImportTables, importTablesController);
routes.patch('/:id/status', requirePermission('menu', 'menu.ver_mesas'), validateStatusTable, updateTableStatusController);
routes.patch('/:id/position', requirePermission('menu', 'menu.gestionar_mesas'), validatePositionTable, updateTablePositionController);
routes.patch('/:id', requirePermission('menu', 'menu.gestionar_mesas'), validateUpdateTable, updateTableController);
routes.delete('/:id', requirePermission('menu', 'menu.gestionar_mesas'), deleteTableController);

export default routes;

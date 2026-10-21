import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import { validateProductImport } from '../../../../validations/admin/warehouse/product-import.validation';
import {
  importProductsController,
  getProductImportCapacityController,
} from '../../../../controllers/admin/warehouse/product-import.controller';
import {
  validateCreateProduct,
  validateUpdateProduct
} from '../../../../validations/admin/products.validation';
import {
  validateCreateExtraGroup,
  validateUpdateExtraGroup,
  validateCreateExtra,
  validateUpdateExtra,
  validateAssignGroupToProduct,
} from '../../../../validations/admin/warehouse/extras.validation';
import {
  createProductController,
  deleteProductController,
  getAllProductsController,
  getProductByIdController,
  updateProductController
} from '../../../../controllers/admin/warehouse/products.controller';
import * as extras from '../../../../controllers/admin/warehouse/extras.controller';
import {
  getProductKitchenStationsController,
  assignStationToProductController,
  unassignStationFromProductController,
} from '../../../../controllers/admin/config-local/kitchen-station.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

// ── Productos ────────────────────────────────────────────────────────────────
routes.get('/', getAllProductsController);
routes.post('/', validateCreateProduct, createProductController);
routes.get('/import/capacity', requirePermission('menu', 'menu.gestionar_productos'), getProductImportCapacityController);
routes.post('/import', requirePermission('menu', 'menu.gestionar_productos'), validateProductImport, importProductsController);
routes.get('/:id', getProductByIdController);
routes.patch('/:id', validateUpdateProduct, updateProductController);
routes.delete('/:id', deleteProductController);

// ── Grupos de extras asignados a un producto ─────────────────────────────────
routes.get('/:id/extra-groups', extras.getProductExtraGroups);
routes.post('/:id/extra-groups', validateAssignGroupToProduct, extras.assignGroupToProduct);
routes.delete('/:id/extra-groups/:groupId', extras.unassignGroupFromProduct);

// ── Estaciones de cocina asignadas a un producto (SIGG 2.7) ─────────────────
routes.get('/:id/kitchen-stations', getProductKitchenStationsController);
routes.post('/:id/kitchen-stations', assignStationToProductController);
routes.delete('/:id/kitchen-stations/:stationCode', unassignStationFromProductController);

// ── Gestión global de grupos de extras ──────────────────────────────────────
routes.get('/extra-groups/all', extras.listExtraGroups);
routes.get('/extra-groups/:id', extras.getExtraGroup);
routes.get('/extra-groups/:id/products', extras.getGroupProducts);
routes.post('/extra-groups', validateCreateExtraGroup, extras.createExtraGroup);
routes.patch('/extra-groups/:id', validateUpdateExtraGroup, extras.updateExtraGroup);
routes.delete('/extra-groups/:id', extras.deleteExtraGroup);

// ── Extras individuales dentro de un grupo ───────────────────────────────────
routes.post('/extra-groups/:groupId/extras', validateCreateExtra, extras.createExtra);
routes.patch('/extra-groups/:groupId/extras/:id', validateUpdateExtra, extras.updateExtra);
routes.delete('/extra-groups/:groupId/extras/:id', extras.deleteExtra);

export default routes;

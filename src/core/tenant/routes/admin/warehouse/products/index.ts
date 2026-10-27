import { Hono, type Context, type Next } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import { hasPermission } from '@/utils/permissions';
import { validateProductImport } from '../../../../validations/admin/warehouse/product-import.validation';
import {
  importProductsController,
  getProductImportCapacityController,
  uploadImportedProductImageController,
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
  validateBulkAssignGroupByCategory,
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

const canManageExtras = requirePermission('menu', 'menu.gestionar_extras');

// Vincular grupos a un producto se hace desde Extras o desde el modal del producto
const canLinkProductExtras = async (c: Context, next: Next) => {
  if (hasPermission(c, 'menu.gestionar_extras') || hasPermission(c, 'menu.gestionar_productos')) return next();
  return c.json({ success: false, message: 'No tienes permisos para realizar esta acción' }, 403);
};

routes.use('*', authMiddleware);

// ── Productos ────────────────────────────────────────────────────────────────
routes.get('/', getAllProductsController);
routes.post('/', validateCreateProduct, createProductController);
routes.get('/import/capacity', requirePermission('menu', 'menu.importar_productos'), getProductImportCapacityController);
routes.post('/import', requirePermission('menu', 'menu.importar_productos'), validateProductImport, importProductsController);
routes.post('/import/:id/image', requirePermission('menu', 'menu.importar_productos'), uploadImportedProductImageController);
routes.get('/:id', getProductByIdController);
routes.patch('/:id', validateUpdateProduct, updateProductController);
routes.delete('/:id', deleteProductController);

// ── Grupos de extras asignados a un producto ─────────────────────────────────
routes.get('/:id/extra-groups', extras.getProductExtraGroups);
routes.post('/:id/extra-groups', canLinkProductExtras, validateAssignGroupToProduct, extras.assignGroupToProduct);
routes.delete('/:id/extra-groups/:groupId', canLinkProductExtras, extras.unassignGroupFromProduct);

// ── Estaciones de cocina asignadas a un producto (SIGG 2.7) ─────────────────
routes.get('/:id/kitchen-stations', getProductKitchenStationsController);
routes.post('/:id/kitchen-stations', assignStationToProductController);
routes.delete('/:id/kitchen-stations/:stationCode', unassignStationFromProductController);

// ── Gestión global de grupos de extras ──────────────────────────────────────
routes.get('/extra-groups/all', extras.listExtraGroups);
routes.get('/extra-groups/:id', extras.getExtraGroup);
routes.get('/extra-groups/:id/products', extras.getGroupProducts);
routes.post('/extra-groups/:id/bulk-assign', canManageExtras, validateBulkAssignGroupByCategory, extras.bulkAssignGroupByCategory);
routes.get('/extra-groups/:id/category-links', canManageExtras, extras.getCategoryLinks);
routes.delete('/extra-groups/:id/category-links/:categoryId', canManageExtras, extras.removeCategoryLink);
routes.post('/extra-groups', canManageExtras, validateCreateExtraGroup, extras.createExtraGroup);
routes.patch('/extra-groups/:id', canManageExtras, validateUpdateExtraGroup, extras.updateExtraGroup);
routes.delete('/extra-groups/:id', canManageExtras, extras.deleteExtraGroup);

// ── Extras individuales dentro de un grupo ───────────────────────────────────
routes.post('/extra-groups/:groupId/extras', canManageExtras, validateCreateExtra, extras.createExtra);
routes.patch('/extra-groups/:groupId/extras/:id', canManageExtras, validateUpdateExtra, extras.updateExtra);
routes.delete('/extra-groups/:groupId/extras/:id', canManageExtras, extras.deleteExtra);

export default routes;

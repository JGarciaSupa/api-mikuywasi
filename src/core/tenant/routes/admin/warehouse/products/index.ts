import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreateProduct,
  validateUpdateProduct
} from '../../../../validations/admin/products.validation';
import {
  createProductController,
  deleteProductController,
  getAllProductsController,
  getProductByIdController,
  updateProductController
} from '../../../../controllers/admin/warehouse/products.controller';
import * as extras from '../../../../controllers/admin/warehouse/extras.controller';
import * as properties from '../../../../controllers/admin/warehouse/properties.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

// ── Productos ────────────────────────────────────────────────────────────────
routes.get('/', getAllProductsController);
routes.post('/', validateCreateProduct, createProductController);
routes.get('/:id', getProductByIdController);
routes.patch('/:id', validateUpdateProduct, updateProductController);
routes.delete('/:id', deleteProductController);

// ── Grupos de extras asignados a un producto ─────────────────────────────────
routes.get('/:id/extra-groups', extras.getProductExtraGroups);
routes.post('/:id/extra-groups', extras.assignGroupToProduct);
routes.delete('/:id/extra-groups/:groupId', extras.unassignGroupFromProduct);

// ── Gestión global de grupos de extras ──────────────────────────────────────
routes.get('/extra-groups/all', extras.listExtraGroups);
routes.get('/extra-groups/:id', extras.getExtraGroup);
routes.post('/extra-groups', extras.createExtraGroup);
routes.patch('/extra-groups/:id', extras.updateExtraGroup);
routes.delete('/extra-groups/:id', extras.deleteExtraGroup);

// ── Extras individuales dentro de un grupo ───────────────────────────────────
routes.post('/extra-groups/:groupId/extras', extras.createExtra);
routes.patch('/extra-groups/:groupId/extras/:id', extras.updateExtra);
routes.delete('/extra-groups/:groupId/extras/:id', extras.deleteExtra);

// ── Grupos de propiedades asignados a un producto ────────────────────────────
routes.get('/:id/property-groups', properties.getProductPropertyGroups);
routes.post('/:id/property-groups', properties.assignGroupToProduct);
routes.delete('/:id/property-groups/:groupId', properties.unassignGroupFromProduct);

// ── Gestión de grupos de propiedades (por marca) ─────────────────────────────
routes.get('/property-groups/all', properties.listPropertyGroups);
routes.get('/property-groups/:id', properties.getPropertyGroup);
routes.post('/property-groups', properties.createPropertyGroup);
routes.patch('/property-groups/:id', properties.updatePropertyGroup);
routes.delete('/property-groups/:id', properties.deletePropertyGroup);

// ── Propiedades individuales dentro de un grupo ──────────────────────────────
routes.post('/property-groups/:groupId/properties', properties.createProperty);
routes.patch('/property-groups/:groupId/properties/:id', properties.updateProperty);
routes.delete('/property-groups/:groupId/properties/:id', properties.deleteProperty);

export default routes;

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

export default routes;

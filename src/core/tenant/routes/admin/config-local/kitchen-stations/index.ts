import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreateKitchenStation,
  validateUpdateKitchenStation
} from '../../../../validations/admin/config-local/kitchen-station.validation';
import {
  listKitchenStationsController,
  getKitchenStationByIdController,
  createKitchenStationController,
  updateKitchenStationController,
  deleteKitchenStationController,
  bulkAssignStationToCategoryController,
} from '../../../../controllers/admin/config-local/kitchen-station.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', listKitchenStationsController);
routes.get('/:id', getKitchenStationByIdController);
routes.post('/', validateCreateKitchenStation, createKitchenStationController);
routes.patch('/:id', validateUpdateKitchenStation, updateKitchenStationController);
routes.delete('/:id', deleteKitchenStationController);
routes.post('/:id/bulk-assign-category', bulkAssignStationToCategoryController);

export default routes;

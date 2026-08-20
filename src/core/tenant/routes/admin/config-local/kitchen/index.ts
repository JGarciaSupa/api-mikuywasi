import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  getKitchenOrdersController,
  updateKitchenStatusController,
  confirmKitchenStationController,
  setItemPreparedController,
  markOrderPreparedController,
  recallKitchenOrderController
} from '../../../../controllers/admin/config-local/kitchen.controller';

const routes = new Hono();

// Middleware de autenticación y rol
routes.use('*', authMiddleware);

// Endpoints
routes.get('/orders', getKitchenOrdersController);
routes.patch('/orders/:id/status', updateKitchenStatusController);
routes.patch('/orders/:id/items/:itemId/prepared', setItemPreparedController);
routes.post('/orders/:id/prepared', markOrderPreparedController);
routes.post('/orders/:id/stations/:stationId/confirm', confirmKitchenStationController);
routes.post('/orders/:id/recall', recallKitchenOrderController);

export default routes;

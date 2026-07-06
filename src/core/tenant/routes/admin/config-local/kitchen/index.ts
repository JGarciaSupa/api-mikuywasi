import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  getKitchenOrdersController,
  updateKitchenStatusController,
  confirmKitchenStationController
} from '../../../../controllers/admin/config-local/kitchen.controller';

const routes = new Hono();

// Middleware de autenticación y rol
routes.use('*', authMiddleware);

// Endpoints
routes.get('/orders', getKitchenOrdersController);
routes.patch('/orders/:id/status', updateKitchenStatusController);
routes.post('/orders/:id/stations/:stationId/confirm', confirmKitchenStationController);

export default routes;

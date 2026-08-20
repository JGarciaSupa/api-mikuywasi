import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  getKitchenOrdersController,
  updateKitchenStatusController,
  confirmKitchenStationController,
  setKitchenItemPreparedController,
  markKitchenOrderPreparedController,
  recallKitchenOrderController
} from '../../../../controllers/admin/config-local/kitchen.controller';

const routes = new Hono();

// Middleware de autenticación y rol
routes.use('*', authMiddleware);

// Endpoints
routes.get('/orders', getKitchenOrdersController);
routes.patch('/orders/:id/status', updateKitchenStatusController);
// Avance por línea: la fuente de verdad del estado de cocina.
routes.patch('/orders/:id/items/:itemId/prepared', setKitchenItemPreparedController);
routes.post('/orders/:id/prepared', markKitchenOrderPreparedController);
routes.post('/orders/:id/stations/:stationId/confirm', confirmKitchenStationController);
// Recall: devolver a la cola un pedido cerrado por error.
routes.post('/orders/:id/recall', recallKitchenOrderController);

export default routes;

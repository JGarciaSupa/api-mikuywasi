import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import {
  createWaiterOrderController,
  getWaiterMenuController,
  getWaiterTablesStatusController,
  editOrderItemController,
  cancelOrderController,
} from '../../../controllers/admin/waiter.controller';
import { validateCreateOrderFromToken } from '../../../validations/client/order.validation';

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin', 'waiter']));

routes.get('/menu', getWaiterMenuController);
routes.get('/tables/status', getWaiterTablesStatusController);
routes.post('/orders', validateCreateOrderFromToken, createWaiterOrderController);
routes.patch('/orders/:id/items', editOrderItemController);
routes.post('/orders/:id/cancel', cancelOrderController);

export default routes;

import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  createWaiterOrderController,
  getWaiterMenuController,
  getWaiterTablesStatusController,
  editOrderItemController,
  cancelOrderController,
  getWaiterOrderController,
  updateWaiterOrderStatusController,
  updateWaiterOrderPaymentStatusController,
  updateWaiterOrderWaiterController,
} from '../../../../controllers/admin/config-local/waiter.controller';
import { validateCreateOrderFromToken } from '../../../../validations/client/order.validation';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/menu', getWaiterMenuController);
routes.get('/tables/status', getWaiterTablesStatusController);
routes.post('/orders', validateCreateOrderFromToken, createWaiterOrderController);
routes.get('/orders/:id', getWaiterOrderController);
routes.patch('/orders/:id/status', updateWaiterOrderStatusController);
routes.patch('/orders/:id/payment-status', updateWaiterOrderPaymentStatusController);
routes.patch('/orders/:id/waiter', updateWaiterOrderWaiterController);
routes.patch('/orders/:id/items', editOrderItemController);
routes.post('/orders/:id/cancel', cancelOrderController);

export default routes;

import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import {
  createWaiterOrderController,
  getWaiterMenuController,
} from '../../../controllers/admin/waiter.controller';
import { validateCreateOrderFromToken } from '../../../validations/client/order.validation';

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin', 'waiter']));

routes.get('/menu', getWaiterMenuController);
routes.post('/orders', validateCreateOrderFromToken, createWaiterOrderController);

export default routes;

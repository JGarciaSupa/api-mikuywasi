import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { 
  getKitchenOrdersController, 
  updateKitchenStatusController 
} from '../../../controllers/admin/kitchen.controller';

const routes = new Hono();

// Middleware de autenticación y rol
routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin', 'kitchen']));

// Endpoints
routes.get('/orders', getKitchenOrdersController);
routes.patch('/orders/:id/status', updateKitchenStatusController);

export default routes;

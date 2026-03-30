import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../middleware/auth.middleware';
import { getDashboardStatsController } from '../../controllers/admin/dashboard.controller';

const routes = new Hono();

// All dashboard routes require authentication and super-admin role
routes.use('*', authMiddleware, roleMiddleware(['super-admin']));

routes.get('/stats', getDashboardStatsController);

export default routes;

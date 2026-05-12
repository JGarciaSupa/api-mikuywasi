import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { getDashboardStatsController } from '../../../controllers/admin/dashboard.controller';
import { getTenantDashboardStatsController } from '../../../controllers/admin/tenant-dashboard.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/stats', roleMiddleware(['super-admin']), getDashboardStatsController);
routes.get('/tenant-stats', roleMiddleware(['admin']), getTenantDashboardStatsController);

export default routes;
  
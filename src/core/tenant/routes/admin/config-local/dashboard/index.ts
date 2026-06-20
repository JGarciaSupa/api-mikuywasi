import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import { getTenantDashboardStatsController } from '../../../../controllers/admin/config-local/tenant-dashboard.controller';

const routes = new Hono();

routes.use('/*', authMiddleware);

routes.get('/tenant-stats', getTenantDashboardStatsController);

export default routes;

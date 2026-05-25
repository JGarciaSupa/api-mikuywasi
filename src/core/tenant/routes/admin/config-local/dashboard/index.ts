import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../../middleware/auth.middleware';
import { getTenantDashboardStatsController } from '../../../../controllers/admin/config-local/tenant-dashboard.controller';

const routes = new Hono();

routes.use('/*', authMiddleware);
routes.use('/*', roleMiddleware(['admin', 'super-admin']));

routes.get('/tenant-stats', getTenantDashboardStatsController);

export default routes;

import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import { getTenantDashboardStatsController } from '../../../../controllers/admin/config-local/tenant-dashboard.controller';

const routes = new Hono();

routes.use('/*', authMiddleware);

routes.get('/tenant-stats', requirePermission('administracion', 'administracion.ver_inicio'), getTenantDashboardStatsController);

export default routes;

import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { getDashboardStatsController } from '../../../controllers/admin/dashboard.controller';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';

const routes = new Hono();

const dashboardLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('*', authMiddleware, roleMiddleware(['super-admin']));

routes.get('/stats', dashboardLimiter, getDashboardStatsController);

export default routes;
  
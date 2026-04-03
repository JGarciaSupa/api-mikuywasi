import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';
import { getTenantBySlugController, getMenuByCategoryController } from '../../controllers/client/tenant.controller';

const routes = new Hono();

const clientLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiadas peticiones, intente de nuevo en 1 minuto'
  }
});

// Tenant Endpoints
routes.get('/tenant/:slug', clientLimiter, getTenantBySlugController);
routes.get('/menu/:slug', clientLimiter, getMenuByCategoryController);

export default routes;


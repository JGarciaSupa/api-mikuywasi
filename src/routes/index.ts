import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { getClientIp } from '../utils/ip';
import admin from './admin';
import client from './client';

const routes = new Hono();

const adminLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: (c) => getClientIp(c),
  message: {
    success: false,
    message: 'Demasiadas peticiones (Admin), intente de nuevo en 1 minuto'
  }
});

const clientLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (c) => getClientIp(c),
  message: {
    success: false,
    message: 'Demasiadas peticiones, intente de nuevo en 1 minuto'
  }
});

routes.use('/admin/*', adminLimiter);
routes.route('/admin', admin);

routes.use('/client/*', clientLimiter);
routes.route('/client', client);

export default routes;

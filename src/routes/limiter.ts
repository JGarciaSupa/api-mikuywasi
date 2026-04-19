import { rateLimiter } from 'hono-rate-limiter';
import { getClientIp } from '../utils/ip';

export const adminLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: (c) => getClientIp(c),
  message: {
    success: false,
    message: 'Demasiadas peticiones (Admin), intente de nuevo en 1 minuto'
  }
});

export const clientLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 3, // Reducido para pruebas rápidas
  keyGenerator: (c) => getClientIp(c),
  message: {
    success: false,
    message: 'Demasiadas peticiones, intente de nuevo en 1 minuto'
  }
});

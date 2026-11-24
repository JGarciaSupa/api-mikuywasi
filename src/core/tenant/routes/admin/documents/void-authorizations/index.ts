import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import * as voids from '../../../../controllers/admin/documents/void-authorizations.controller';
import { getClientIp } from '@/utils/ip';

const routes = new Hono();

// Pocos intentos por IP para la contraseña del supervisor: frena la fuerza bruta.
const approveLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  keyGenerator: (c) => getClientIp(c),
  message: { success: false, message: 'Demasiados intentos, espera unos minutos e intenta de nuevo' },
});

// Públicos: el supervisor abre el enlace en su celular, sin iniciar sesión.
// El token del enlace es aleatorio (256 bits); la aprobación además bloquea la solicitud a los 5 fallos.
routes.get('/:token', voids.getVoidRequest);
routes.post('/:token/approve', approveLimiter, voids.approveVoidRequest);

// Con sesión: cualquier usuario puede pedir autorización (justamente quien no tiene el permiso)
routes.post('/', authMiddleware, voids.createVoidRequest);

export default routes;

import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import * as terminals from '../../../../controllers/admin/documents/cash-terminals.controller';
import { getClientIp } from '@/utils/ip';

const routes = new Hono();

// Pocos intentos por IP para lo que recibe un secreto (PIN o contraseña): frena la fuerza bruta.
// Cada acción tiene su propio contador para que vincular equipos no consuma los intentos del supervisor.
const attemptLimiter = () => rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  keyGenerator: (c) => getClientIp(c),
  message: { success: false, message: 'Demasiados intentos, espera unos minutos e intenta de nuevo' },
});
const pairLimiter = attemptLimiter();
const approveLimiter = attemptLimiter();

// Públicos: el supervisor abre el enlace de la solicitud en su celular, sin iniciar sesión.
// El token del enlace es aleatorio (256 bits); la aprobación además bloquea la solicitud a los 5 fallos.
routes.get('/close-requests/:token', terminals.getCloseRequest);
routes.post('/close-requests/:token/approve', approveLimiter, terminals.approveCloseRequest);

// Con sesión
routes.post('/close-requests', authMiddleware, terminals.createCloseRequest);
routes.get('/current', authMiddleware, terminals.getCurrentTerminal);
routes.post('/pair', authMiddleware, pairLimiter, terminals.pairTerminal);
routes.get('/', authMiddleware, requirePermission('caja', 'caja.gestionar_cajas'), terminals.listTerminals);
routes.post('/pairing-codes', authMiddleware, requirePermission('caja', 'caja.gestionar_cajas'), terminals.createPairingCode);
routes.delete('/:id', authMiddleware, requirePermission('caja', 'caja.gestionar_cajas'), terminals.revokeTerminal);

export default routes;

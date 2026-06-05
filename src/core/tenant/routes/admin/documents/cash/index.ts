import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../../middleware/auth.middleware';
import * as cash from '../../../../controllers/admin/documents/cash.controller';

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/registers', cash.listCashRegisters);
routes.post('/registers', cash.createCashRegister);
routes.patch('/registers/:id', cash.updateCashRegister);

routes.get('/sessions', cash.listCashSessions);
routes.get('/sessions/current', cash.getCurrentSession);
routes.post('/sessions/open', cash.openCashSession);
routes.get('/sessions/:id', cash.getCashSessionById);
routes.post('/sessions/:id/close', cash.closeCashSession);
routes.post('/sessions/:id/movements', cash.addCashMovement);

export default routes;

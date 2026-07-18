import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import * as cash from '../../../../controllers/admin/documents/cash.controller';
import {
  getCashReportSummaryController,
  getCashReportSessionsController,
  getCashReportMovementsController,
  getCashReportExportController,
} from '../../../../controllers/admin/documents/cash-reports.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

// Reportes agregados / histórico
routes.get('/reports/summary', getCashReportSummaryController);
routes.get('/reports/sessions', getCashReportSessionsController);
routes.get('/reports/movements', getCashReportMovementsController);
routes.get('/reports/export', getCashReportExportController);

routes.get('/registers', cash.listCashRegisters);
routes.post('/registers', cash.createCashRegister);
routes.patch('/registers/:id', cash.updateCashRegister);
routes.post('/registers/:id/close', cash.closeCashRegister);

routes.get('/sessions', cash.listCashSessions);
routes.get('/sessions/current', cash.getCurrentSession);
routes.get('/sessions/mine', cash.getMyCashSession);
routes.post('/sessions/open', cash.openCashSession);
routes.get('/sessions/:id', cash.getCashSessionById);
routes.post('/sessions/:id/close', cash.closeCashSession);
routes.post('/sessions/:id/movements', cash.addCashMovement);
routes.post('/refund', cash.refundOrder);

export default routes;

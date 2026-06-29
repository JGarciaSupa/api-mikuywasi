import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import * as audit from '../../../../controllers/admin/documents/audit-log.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', audit.listAuditLogs);
routes.get('/facets', audit.getAuditFacets);

export default routes;

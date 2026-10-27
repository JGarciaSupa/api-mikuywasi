import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import * as audit from '../../../../controllers/admin/documents/audit-log.controller';

const routes = new Hono();

const canViewAudit = requirePermission('administracion', 'administracion.auditoria');

routes.use('*', authMiddleware);

routes.get('/', canViewAudit, audit.listAuditLogs);
routes.get('/facets', canViewAudit, audit.getAuditFacets);

export default routes;

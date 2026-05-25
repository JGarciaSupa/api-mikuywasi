import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import * as rbac from '../controllers/rbac.controller';
import {
  validateCreateAction, validateUpdateAction,
  validateCreateSubAction, validateUpdateSubAction,
  validateCreateBaseRole, validateUpdateBaseRole,
  validateGrantFeatures, validateRevokeFeatures,
  validateGrantRoles, validateRevokeRoles,
} from '../validations/rbac.validation';

const routes = new Hono();

routes.use('*', masterAuthMiddleware);

// ── Catálogo global: Acciones ─────────────────────────────────────────────────
routes.get('/actions', rbac.listActions);
routes.get('/actions/:id', rbac.getAction);
routes.post('/actions', validateCreateAction, rbac.createAction);
routes.put('/actions/:id', validateUpdateAction, rbac.updateAction);

// ── Catálogo global: Sub-Acciones ─────────────────────────────────────────────
routes.get('/sub-actions', rbac.listSubActions);            // ?actionId=1
routes.post('/sub-actions', validateCreateSubAction, rbac.createSubAction);
routes.put('/sub-actions/:id', validateUpdateSubAction, rbac.updateSubAction);

// ── Roles Base (Plantillas globales) ─────────────────────────────────────────
routes.get('/base-roles', rbac.listBaseRoles);
routes.get('/base-roles/:id', rbac.getBaseRole);
routes.post('/base-roles', validateCreateBaseRole, rbac.createBaseRole);
routes.put('/base-roles/:id', validateUpdateBaseRole, rbac.updateBaseRole);

// ── Gestión de grants por tenant ──────────────────────────────────────────────
routes.get('/tenants/:tenantId/grants', rbac.getTenantGrants);
routes.post('/tenants/:tenantId/feature-grants', validateGrantFeatures, rbac.grantFeatures);
routes.delete('/tenants/:tenantId/feature-grants', validateRevokeFeatures, rbac.revokeFeatures);
routes.post('/tenants/:tenantId/role-grants', validateGrantRoles, rbac.grantRoles);
routes.delete('/tenants/:tenantId/role-grants', validateRevokeRoles, rbac.revokeRoles);
routes.post('/tenants/:tenantId/sync', rbac.triggerFullSync);

export default routes;

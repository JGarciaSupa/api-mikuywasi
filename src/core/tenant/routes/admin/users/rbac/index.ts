import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import * as rbac from '../../../../controllers/admin/users/rbac.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

// ── Catálogo de permisos disponibles para este tenant (solo lectura) ──────────
routes.get('/catalog', rbac.listPermissionsCatalog);

// ── Roles del tenant ──────────────────────────────────────────────────────────
routes.get('/roles', rbac.listRoles);
routes.get('/roles/:id', rbac.getRole);

routes.post('/roles', zValidator('json', z.object({
  code: z.string().min(2).max(50).regex(/^[a-z_]+$/, 'Solo letras minúsculas y guiones bajos'),
  name: z.string().min(2).max(100),
  description: z.string().max(255).optional(),
  permCatalogIds: z.array(z.number().int().positive()).default([]),
})), rbac.createRole);

routes.put('/roles/:id', zValidator('json', z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(255).optional(),
  isActive: z.boolean().optional(),
  permCatalogIds: z.array(z.number().int().positive()).optional(),
})), rbac.updateRole);

routes.delete('/roles/:id', rbac.deleteRole);

// ── Asignación de rol a usuario ───────────────────────────────────────────────
routes.get('/users/:userId/role', rbac.getUserRole);

routes.post('/user-roles', zValidator('json', z.object({
  userId: z.number().int().positive(),
  roleId: z.number().int().positive(),
})), rbac.assignRole);

routes.delete('/user-roles/:userId', rbac.removeRole);

// ── Overrides de permisos por usuario ────────────────────────────────────────
routes.get('/users/:userId/overrides', rbac.getUserOverrides);

routes.put('/users/:userId/overrides', zValidator('json', z.object({
  overrides: z.array(z.object({
    permCatalogId: z.number().int().positive(),
    type: z.enum(['grant', 'deny']),
  })),
})), rbac.setUserOverrides);

routes.delete('/users/:userId/overrides/:permCatalogId', rbac.removeUserOverride);

export default routes;

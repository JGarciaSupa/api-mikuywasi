import type { Context } from 'hono';
import * as rbac from '../../services/admin/rbac.service';
import { jsonError } from '../../../../utils/helpers';

// ── Catálogo ──────────────────────────────────────────────────────────────────

export const listPermissionsCatalog = async (c: Context) => {
  try {
    const data = await rbac.listPermissionsCatalog();
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al listar catálogo de permisos'); }
};

// ── Roles ─────────────────────────────────────────────────────────────────────

export const listRoles = async (c: Context) => {
  try {
    const data = await rbac.listRoles();
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al listar roles'); }
};

export const getRole = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await rbac.getRoleById(id);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al obtener rol'); }
};

export const createRole = async (c: Context) => {
  try {
    const body = c.req.valid('json' as never);
    const data = await rbac.createCustomRole(body);
    return c.json({ success: true, data }, 201);
  } catch (e) { return jsonError(c, e, 'Error al crear rol'); }
};

export const updateRole = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = c.req.valid('json' as never);
    const data = await rbac.updateRole(id, body);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al actualizar rol'); }
};

export const deleteRole = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    await rbac.deleteRole(id);
    return c.json({ success: true, message: 'Rol eliminado' });
  } catch (e) { return jsonError(c, e, 'Error al eliminar rol'); }
};

// ── Asignación usuario → rol ──────────────────────────────────────────────────

export const assignRole = async (c: Context) => {
  try {
    const { userId, roleId } = c.req.valid('json' as never) as { userId: number; roleId: number };
    const assignedBy = c.get('jwtPayload').userId;
    const data = await rbac.assignRoleToUser(userId, roleId, assignedBy);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al asignar rol'); }
};

export const removeRole = async (c: Context) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    await rbac.removeRoleFromUser(userId);
    return c.json({ success: true, message: 'Rol removido del usuario' });
  } catch (e) { return jsonError(c, e, 'Error al remover rol'); }
};

export const getUserRole = async (c: Context) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    const data = await rbac.getUserRole(userId);
    return c.json({ success: true, data: data ?? null });
  } catch (e) { return jsonError(c, e, 'Error al obtener rol del usuario'); }
};

// ── Overrides de permisos por usuario ────────────────────────────────────────

export const getUserOverrides = async (c: Context) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    const data = await rbac.getUserOverrides(userId);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al obtener overrides del usuario'); }
};

export const setUserOverrides = async (c: Context) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    const { overrides } = c.req.valid('json' as never) as {
      overrides: { permCatalogId: number; type: 'grant' | 'deny' }[];
    };
    const assignedBy = c.get('jwtPayload').userId;
    const data = await rbac.setUserOverrides(userId, overrides, assignedBy);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al guardar overrides del usuario'); }
};

export const removeUserOverride = async (c: Context) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    const permCatalogId = parseInt(c.req.param('permCatalogId'));
    await rbac.removeUserOverride(userId, permCatalogId);
    return c.json({ success: true, message: 'Override eliminado' });
  } catch (e) { return jsonError(c, e, 'Error al eliminar override'); }
};

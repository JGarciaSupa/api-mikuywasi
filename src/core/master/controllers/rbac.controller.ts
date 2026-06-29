import type { Context } from 'hono';
import * as rbac from '../services/rbac.service';
import {
  syncPermissionsCatalog, syncBaseRolesToTenant, fullSyncTenant,
  grantAndSyncToAllTenants, syncToAllGrantedTenants,
} from '../services/rbac-sync.service';

function jsonError(c: Context, e: unknown, msg: string) {
  console.error(msg, e);
  const message = e instanceof Error ? e.message : msg;
  return c.json({ success: false, message }, 400);
}

// ── Actions ──────────────────────────────────────────────────────────────────

export const listActions = async (c: Context) => {
  try {
    const data = await rbac.listActions();
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al listar acciones'); }
};

export const getAction = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await rbac.getActionById(id);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al obtener acción'); }
};

export const createAction = async (c: Context) => {
  try {
    const body = c.req.valid('json' as never);
    const data = await rbac.createAction(body);
    return c.json({ success: true, data }, 201);
  } catch (e) { return jsonError(c, e, 'Error al crear acción'); }
};

export const updateAction = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = c.req.valid('json' as never);
    const data = await rbac.updateAction(id, body);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al actualizar acción'); }
};

// ── Sub-Actions ───────────────────────────────────────────────────────────────

export const listSubActions = async (c: Context) => {
  try {
    const actionId = c.req.query('actionId') ? parseInt(c.req.query('actionId')!) : undefined;
    const data = await rbac.listSubActions(actionId);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al listar sub-acciones'); }
};

export const createSubAction = async (c: Context) => {
  try {
    const body = c.req.valid('json' as never);
    const data = await rbac.createSubAction(body);
    return c.json({ success: true, data }, 201);
  } catch (e) { return jsonError(c, e, 'Error al crear sub-acción'); }
};

export const updateSubAction = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = c.req.valid('json' as never) as Partial<{
      code: string; name: string; description: string; order: number; isActive: boolean;
    }>;
    const data = await rbac.updateSubAction(id, body);
    // Si cambia el código, propagar a todos los tenants que tienen esta sub-acción
    if (body.code) {
      await syncToAllGrantedTenants(id);
    }
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al actualizar sub-acción'); }
};

export const grantSubActionToAllTenants = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const userId = c.get('masterPayload' as never)?.id;
    const result = await grantAndSyncToAllTenants(id, userId);
    return c.json({
      success: true,
      message: `Sub-acción habilitada en ${result.granted} empresa(s). Errores de sync: ${result.errors}.`,
      data: result,
    });
  } catch (e) { return jsonError(c, e, 'Error al habilitar sub-acción en todas las empresas'); }
};

// ── Base Roles ────────────────────────────────────────────────────────────────

export const listBaseRoles = async (c: Context) => {
  try {
    const data = await rbac.listBaseRoles();
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al listar roles base'); }
};

export const getBaseRole = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await rbac.getBaseRoleById(id);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al obtener rol base'); }
};

export const createBaseRole = async (c: Context) => {
  try {
    const body = c.req.valid('json' as never);
    const data = await rbac.createBaseRole(body);
    return c.json({ success: true, data }, 201);
  } catch (e) { return jsonError(c, e, 'Error al crear rol base'); }
};

export const updateBaseRole = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = c.req.valid('json' as never);
    const data = await rbac.updateBaseRole(id, body);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al actualizar rol base'); }
};

// ── Tenant Grants ─────────────────────────────────────────────────────────────

export const getTenantGrants = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('tenantId'));
    const data = await rbac.getTenantGrants(tenantId);
    return c.json({ success: true, data });
  } catch (e) { return jsonError(c, e, 'Error al obtener grants del tenant'); }
};

export const grantFeatures = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('tenantId'));
    const { subActionIds } = c.req.valid('json' as never) as { subActionIds: number[] };
    const userId = c.get('masterPayload' as never)?.id;

    await rbac.grantFeaturesToTenant(tenantId, subActionIds, userId);

    // Sync automático: actualiza el catálogo y los roles clonados en la BD del tenant
    await fullSyncTenant(tenantId);

    return c.json({ success: true, message: 'Features habilitados y sincronizados con el tenant' });
  } catch (e) { return jsonError(c, e, 'Error al habilitar features'); }
};

export const revokeFeatures = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('tenantId'));
    const { subActionIds } = c.req.valid('json' as never) as { subActionIds: number[] };

    await rbac.revokeFeatureFromTenant(tenantId, subActionIds);
    await fullSyncTenant(tenantId);

    return c.json({ success: true, message: 'Features revocados y sincronizados con el tenant' });
  } catch (e) { return jsonError(c, e, 'Error al revocar features'); }
};

export const grantRoles = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('tenantId'));
    const { baseRoleIds } = c.req.valid('json' as never) as { baseRoleIds: number[] };
    const userId = c.get('masterPayload' as never)?.id;

    await rbac.grantRolesToTenant(tenantId, baseRoleIds, userId);
    await syncBaseRolesToTenant(tenantId, baseRoleIds);

    return c.json({ success: true, message: 'Roles habilitados y clonados en el tenant' });
  } catch (e) { return jsonError(c, e, 'Error al habilitar roles'); }
};

export const revokeRoles = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('tenantId'));
    const { baseRoleIds } = c.req.valid('json' as never) as { baseRoleIds: number[] };

    await rbac.revokeRoleFromTenant(tenantId, baseRoleIds);
    // Nota: los roles clonados en el tenant no se eliminan automáticamente
    // para no afectar usuarios que los tengan asignados. El admin del tenant
    // los gestionará desde su panel.

    return c.json({ success: true, message: 'Roles revocados en la BD Master. Los roles locales del tenant se mantienen.' });
  } catch (e) { return jsonError(c, e, 'Error al revocar roles'); }
};

export const triggerFullSync = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('tenantId'));
    await fullSyncTenant(tenantId);
    return c.json({ success: true, message: `Sync completo ejecutado para tenant ${tenantId}` });
  } catch (e) { return jsonError(c, e, 'Error en sync'); }
};

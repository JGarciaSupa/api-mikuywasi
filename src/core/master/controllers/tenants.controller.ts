import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import * as tenantsService from '../services/tenants.service';
import * as tenantCloneService from '../services/tenant-clone.service';
import { parseIdParam } from '@/utils/helpers';

export const getAllTenantsController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const name = c.req.query('name') || undefined;
    const status = c.req.query('status') || undefined;
    const planId = c.req.query('planId') ? parseInt(c.req.query('planId')!) : undefined;
    const serverId = c.req.query('serverId') ? parseInt(c.req.query('serverId')!) : undefined;

    const result = await tenantsService.getAllTenants(page, limit, { name, status, planId, serverId });
    return c.json({
      success: true,
      message: 'Tenants obtenidos con éxito',
      data: {
        list: result.data,
        meta: result.meta
      }
    });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener tenants'), data: null }, 500);
  }
};

export const getTenantByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await tenantsService.getTenantById(id);
    return c.json({ success: true, message: 'Tenant obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Tenant no encontrado'), data: null }, 404);
  }
};

export const getTenantBySlugController = async (c: Context) => {
  try {
    const slug = c.req.param('slug') || '';
    const result = await tenantsService.getTenantBySlug(slug);
    return c.json({ success: true, message: 'Tenant obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Tenant no encontrado'), data: null }, 404);
  }
};

export const createTenantController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await tenantsService.createTenant(data);
    return c.json({ success: true, message: 'Tenant creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al crear el tenant'), data: null }, 400);
  }
};

export const updateTenantController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantsService.updateTenant(id, data);
    return c.json({ success: true, message: 'Tenant actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar el tenant'), data: null }, 400);
  }
};

export const renewSubscriptionController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantsService.renewSubscription(id, data);
    return c.json({ success: true, message: 'Suscripción renovada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al renovar la suscripción'), data: null }, 400);
  }
};

export const deleteTenantController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await tenantsService.deleteTenant(id);
    return c.json({ success: true, message: result.message || 'Tenant eliminado correctamente', data: null });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al eliminar el tenant'), data: null }, 400);
  }
};

// ── DUPLICAR TENANT / PLANTILLA POR DEFECTO ─────────────────────────────────

export const cloneTenantController = async (c: Context) => {
  try {
    const sourceId = parseIdParam(c);
    const data = c.req.valid('json' as never);
    const result = await tenantCloneService.cloneTenant(sourceId, data);
    return c.json({ success: true, message: 'Tenant duplicado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al duplicar el tenant'), data: null }, 400);
  }
};

export const setDefaultTemplateController = async (c: Context) => {
  try {
    const id = parseIdParam(c);
    const { isDefault } = c.req.valid('json' as never) as { isDefault: boolean };
    const result = await tenantCloneService.setDefaultTemplate(id, isDefault);
    return c.json({
      success: true,
      message: isDefault ? 'Plantilla por defecto actualizada' : 'El tenant ya no es la plantilla por defecto',
      data: result,
    });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar la plantilla por defecto'), data: null }, 400);
  }
};

// ── TENANT USERS CONTROLLERS ─────────────────────────────────────────────────

export const getTenantUsersController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const result = await tenantsService.getTenantUsers(tenantId);
    return c.json({
      success: true,
      message: 'Usuarios obtenidos con éxito',
      data: result,
    });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener usuarios'), data: null }, 500);
  }
};

export const createTenantUserController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantsService.createTenantUser(tenantId, data);
    return c.json({
      success: true,
      message: 'Usuario creado con éxito',
      data: result,
    }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al crear usuario'), data: null }, 400);
  }
};

export const updateTenantUserController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const userId = parseInt(c.req.param('userId') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantsService.updateTenantUser(tenantId, userId, data);
    return c.json({
      success: true,
      message: 'Usuario actualizado con éxito',
      data: result,
    });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar usuario'), data: null }, 400);
  }
};

export const updateTenantUserPasswordController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const userId = parseInt(c.req.param('userId') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantsService.updateTenantUserPassword(tenantId, userId, data);
    return c.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar contraseña'), data: null }, 400);
  }
};

export const deleteTenantUserController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const userId = parseInt(c.req.param('userId') || '0');
    const result = await tenantsService.deleteTenantUser(tenantId, userId);
    return c.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al eliminar usuario'), data: null }, 400);
  }
};

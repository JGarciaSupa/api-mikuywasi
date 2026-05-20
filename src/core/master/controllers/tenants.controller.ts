import type { Context } from 'hono';
import * as tenantsService from '../services/tenants.service';

export const getAllTenantsController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const name = c.req.query('name') || undefined;
    const status = c.req.query('status') || undefined;
    const planId = c.req.query('planId') ? parseInt(c.req.query('planId')!) : undefined;
    const serverId = c.req.query('serverId') ? parseInt(c.req.query('serverId')!) : undefined;

    const result = await tenantsService.getAllTenants(page, limit, { name, status, planId, serverId });
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener tenants' }, 500);
  }
};

export const getTenantByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await tenantsService.getTenantById(id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Tenant no encontrado' }, 404);
  }
};

export const getTenantBySlugController = async (c: Context) => {
  try {
    const slug = c.req.param('slug') || '';
    const result = await tenantsService.getTenantBySlug(slug);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Tenant no encontrado' }, 404);
  }
};

export const createTenantController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await tenantsService.createTenant(data);
    return c.json({ success: true, message: 'Tenant creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el tenant' }, 400);
  }
};

export const updateTenantController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantsService.updateTenant(id, data);
    return c.json({ success: true, message: 'Tenant actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el tenant' }, 400);
  }
};

export const renewSubscriptionController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantsService.renewSubscription(id, data);
    return c.json({ success: true, message: 'Suscripción renovada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al renovar la suscripción' }, 400);
  }
};

export const deleteTenantController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await tenantsService.deleteTenant(id);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el tenant' }, 400);
  }
};

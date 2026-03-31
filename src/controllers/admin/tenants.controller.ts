import type { Context } from 'hono';
import { createTenant, getAllTenants, updateTenant, renewSubscription, getTenantById, getTenantUsers, createTenantUser } from '../../services/admin/tenants.service';

export const getAllTenantsController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const name = c.req.query('name') || undefined;
    const status = c.req.query('status') || undefined;
    const planId = c.req.query('planId') ? parseInt(c.req.query('planId')!) : undefined;

    const result = await getAllTenants(page, limit, { name, status, planId });
    return c.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener los tenants'
    }, 500);
  }
};

export const createTenantController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await createTenant(data);
    return c.json({
      success: true,
      message: 'Tenant creado con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear el tenant'
    }, 400);
  }
};

export const updateTenantController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) throw new Error('ID no proporcionado');
    const id = parseInt(idParam);
    const data = c.req.valid('json' as never);
    const result = await updateTenant(id, data);
    return c.json({
      success: true,
      message: 'Tenant actualizado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el tenant'
    }, 400);
  }
};

export const renewSubscriptionController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) throw new Error('ID no proporcionado');
    const id = parseInt(idParam);
    const data = c.req.valid('json' as never);
    const result = await renewSubscription(id, data);
    return c.json({
      success: true,
      message: 'Suscripción renovada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al renovar la suscripción'
    }, 400);
  }
};

export const getTenantByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await getTenantById(id);
    return c.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener el tenant'
    }, 404);
  }
};

export const getTenantUsersController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await getTenantUsers(id);
    return c.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener los usuarios'
    }, 500);
  }
};

export const createTenantUserController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await createTenantUser(tenantId, data);
    return c.json({
      success: true,
      message: 'Usuario creado con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear el usuario'
    }, 400);
  }
};

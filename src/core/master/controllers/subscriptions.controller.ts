import type { Context } from 'hono';
import * as subscriptionsService from '../services/subscriptions.service';

export const getAllSubscriptionsController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const tenantId = c.req.query('tenantId') ? parseInt(c.req.query('tenantId')!) : undefined;
    const status = c.req.query('status') || undefined;
    const planId = c.req.query('planId') ? parseInt(c.req.query('planId')!) : undefined;

    const result = await subscriptionsService.getAllSubscriptions(page, limit, { tenantId, status, planId });
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener suscripciones' }, 500);
  }
};

export const getSubscriptionByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await subscriptionsService.getSubscriptionById(id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Suscripción no encontrada' }, 404);
  }
};

export const getSubscriptionsByTenantController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('tenantId') || '0');
    const result = await subscriptionsService.getSubscriptionsByTenant(tenantId);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener suscripciones' }, 404);
  }
};

export const updateSubscriptionController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await subscriptionsService.updateSubscription(id, data);
    return c.json({ success: true, message: 'Suscripción actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la suscripción' }, 400);
  }
};

export const cancelSubscriptionController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await subscriptionsService.cancelSubscription(id);
    return c.json({ success: true, message: 'Suscripción cancelada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al cancelar la suscripción' }, 400);
  }
};

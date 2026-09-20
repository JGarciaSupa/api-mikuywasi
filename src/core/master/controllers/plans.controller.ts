import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import * as plansService from '../services/plans.service';

export const getAllPlansController = async (c: Context) => {
  try {
    const all = c.req.query('all') === 'true'; // incluir ocultos si es super-admin
    const result = await plansService.getAllPlans(all);
    return c.json({ success: true, message: 'Planes obtenidos con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener planes'), data: null }, 500);
  }
};

export const getPlanByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await plansService.getPlanById(id);
    return c.json({ success: true, message: 'Plan obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Plan no encontrado'), data: null }, 404);
  }
};

export const createPlanController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await plansService.createPlan(data);
    return c.json({ success: true, message: 'Plan creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al crear el plan'), data: null }, 400);
  }
};

export const updatePlanController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await plansService.updatePlan(id, data);
    return c.json({ success: true, message: 'Plan actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar el plan'), data: null }, 400);
  }
};

export const deletePlanController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await plansService.deletePlan(id);
    return c.json({ success: true, message: result.message || 'Plan eliminado correctamente', data: null });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al eliminar el plan'), data: null }, 400);
  }
};

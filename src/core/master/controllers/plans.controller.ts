import type { Context } from 'hono';
import * as plansService from '../services/plans.service';

export const getAllPlansController = async (c: Context) => {
  try {
    const all = c.req.query('all') === 'true'; // incluir ocultos si es super-admin
    const result = await plansService.getAllPlans(all);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener planes' }, 500);
  }
};

export const getPlanByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await plansService.getPlanById(id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Plan no encontrado' }, 404);
  }
};

export const createPlanController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await plansService.createPlan(data);
    return c.json({ success: true, message: 'Plan creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el plan' }, 400);
  }
};

export const updatePlanController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await plansService.updatePlan(id, data);
    return c.json({ success: true, message: 'Plan actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el plan' }, 400);
  }
};

export const deletePlanController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await plansService.deletePlan(id);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el plan' }, 400);
  }
};

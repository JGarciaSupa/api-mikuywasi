import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import * as planFeaturesService from '../services/plan-features.service';

export const getAllPlanFeaturesController = async (c: Context) => {
  try {
    const result = await planFeaturesService.getAllPlanFeatures();
    return c.json({ success: true, message: 'Características obtenidas con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener las características'), data: null }, 500);
  }
};

export const getSupportedPlanLimitsController = async (c: Context) => {
  try {
    const result = await planFeaturesService.getSupportedPlanLimits();
    return c.json({ success: true, message: 'Límites soportados obtenidos con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener los límites soportados'), data: null }, 500);
  }
};

export const createPlanFeatureController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await planFeaturesService.createPlanFeature(data);
    return c.json({ success: true, message: 'Característica creada con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al crear la característica'), data: null }, 400);
  }
};

export const updatePlanFeatureController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await planFeaturesService.updatePlanFeature(id, data);
    return c.json({ success: true, message: 'Característica actualizada con éxito', data: result });
  } catch (error: any) {
    const status = error.message?.includes('no encontrada') ? 404 : 400;
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar la característica'), data: null }, status);
  }
};

export const deletePlanFeatureController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await planFeaturesService.deletePlanFeature(id);
    return c.json({ success: true, message: result.message, data: null });
  } catch (error: any) {
    const status = error.message?.includes('no encontrada') ? 404 : 409;
    return c.json({ success: false, message: safeMessage(error, 'Error al eliminar la característica'), data: null }, status);
  }
};

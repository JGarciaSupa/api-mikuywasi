import type { Context } from 'hono';
import {
  getAllSalesChannelClassifications,
  getSalesChannelClassificationByCode,
  createSalesChannelClassification,
  updateSalesChannelClassification,
  deleteSalesChannelClassification,
} from '../services/sales-channel-classifications.service';

export const getAllClassificationsController = async (c: Context) => {
  try {
    const classifications = await getAllSalesChannelClassifications();
    return c.json(classifications, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

export const getClassificationByCodeController = async (c: Context) => {
  try {
    const code = c.req.param('code');
    if (!code) return c.json({ error: 'Se requiere el código' }, 400);
    const classification = await getSalesChannelClassificationByCode(code);
    if (!classification) return c.json({ error: 'Clasificación no encontrada' }, 404);
    return c.json(classification, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

export const createClassificationController = async (c: Context) => {
  try {
    const body = await c.req.valid('json' as never);
    const created = await createSalesChannelClassification(body);
    return c.json({ message: 'Clasificación creada', data: created }, 201);
  } catch (error: any) {
    if (error.message.includes('Ya existe')) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: error.message }, 500);
  }
};

export const updateClassificationController = async (c: Context) => {
  try {
    const code = c.req.param('code');
    if (!code) return c.json({ error: 'Se requiere el código' }, 400);
    const body = await c.req.valid('json' as never);
    const updated = await updateSalesChannelClassification(code, body);
    if (!updated) return c.json({ error: 'Clasificación no encontrada' }, 404);
    return c.json({ message: 'Clasificación actualizada', data: updated }, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

export const deleteClassificationController = async (c: Context) => {
  try {
    const code = c.req.param('code');
    if (!code) return c.json({ error: 'Se requiere el código' }, 400);
    const deleted = await deleteSalesChannelClassification(code);
    if (!deleted) return c.json({ error: 'Clasificación no encontrada' }, 404);
    return c.json({ message: 'Clasificación eliminada', data: deleted }, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

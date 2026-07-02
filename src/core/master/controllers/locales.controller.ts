import type { Context } from 'hono';
import * as localesService from '../services/locales.service';

export const getLocalesByBrandController = async (c: Context) => {
  try {
    const brandId = parseInt(c.req.query('brandId') || '0');
    if (!brandId) {
      return c.json({ success: false, message: 'El parámetro brandId es obligatorio', data: null }, 400);
    }
    const result = await localesService.getLocalesByBrand(brandId);
    return c.json({ success: true, message: 'Locales obtenidos con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener locales', data: null }, 500);
  }
};

export const getLocalByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await localesService.getLocalById(id);
    return c.json({ success: true, message: 'Local obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Local no encontrado', data: null }, 404);
  }
};

export const createLocalController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await localesService.createLocal(data);
    return c.json({ success: true, message: 'Local creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el local', data: null }, 400);
  }
};

export const updateLocalController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await localesService.updateLocal(id, data);
    return c.json({ success: true, message: 'Local actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el local', data: null }, 400);
  }
};

export const deleteLocalController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await localesService.deleteLocal(id);
    return c.json({ success: true, message: result.message, data: null });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el local', data: null }, 400);
  }
};

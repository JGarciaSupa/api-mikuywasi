import type { Context } from 'hono';
import * as brandsService from '../services/brands.service';

export const getBrandsByTenantController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.query('tenantId') || '0');
    if (!tenantId) {
      return c.json({ success: false, message: 'El parámetro tenantId es obligatorio', data: null }, 400);
    }
    const result = await brandsService.getBrandsByTenant(tenantId);
    return c.json({ success: true, message: 'Marcas obtenidas con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener marcas', data: null }, 500);
  }
};

export const getBrandByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await brandsService.getBrandById(id);
    return c.json({ success: true, message: 'Marca obtenida con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Marca no encontrada', data: null }, 404);
  }
};

export const createBrandController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await brandsService.createBrand(data);
    return c.json({ success: true, message: 'Marca creada con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear la marca', data: null }, 400);
  }
};

export const updateBrandController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await brandsService.updateBrand(id, data);
    return c.json({ success: true, message: 'Marca actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la marca', data: null }, 400);
  }
};

export const deleteBrandController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await brandsService.deleteBrand(id);
    return c.json({ success: true, message: result.message, data: null });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar la marca', data: null }, 400);
  }
};

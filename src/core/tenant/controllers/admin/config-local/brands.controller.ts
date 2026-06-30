import type { Context } from 'hono';
import * as brandsService from '../../../services/admin/config-local/brands.service';

export const getAllBrandsController = async (c: Context) => {
  try {
    const data = await brandsService.getAllBrands();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener marcas' }, 500);
  }
};

export const getBrandByIdController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await brandsService.getBrandById(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrad') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al obtener marca' }, status as any);
  }
};

export const createBrandController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await brandsService.createBrand(body);
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear marca' }, 400);
  }
};

export const updateBrandController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const data = await brandsService.updateBrand(id, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrad') ? 404 : 400;
    return c.json({ success: false, message: error.message || 'Error al actualizar marca' }, status as any);
  }
};

export const deleteBrandController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await brandsService.deleteBrand(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrad') ? 404 : 400;
    return c.json({ success: false, message: error.message || 'Error al eliminar marca' }, status as any);
  }
};

export const updateBrandLogoController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.parseBody();
    const logoFile = body['logo'] as File;
    if (!logoFile) {
      return c.json({ success: false, message: 'No se proporcionó ningún archivo de logo' }, 400);
    }
    const data = await brandsService.updateBrandLogo(id, logoFile);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrad') ? 404 : 400;
    return c.json({ success: false, message: error.message || 'Error al actualizar logo' }, status as any);
  }
};

export const deleteBrandLogoController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await brandsService.deleteBrandLogo(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrad') ? 404 : 400;
    return c.json({ success: false, message: error.message || 'Error al eliminar logo' }, status as any);
  }
};

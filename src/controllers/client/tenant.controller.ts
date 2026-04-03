import type { Context } from 'hono';
import * as tenantService from '../../services/client/tenant.service';

/**
 * GET /api/client/tenant/:slug
 * Obtener información pública de un tenant por su slug
 */
export const getTenantBySlugController = async (c: Context) => {
  try {
    const slug = c.req.param('slug');
    if (!slug) {
      return c.json({ success: false, message: 'Slug requerido' }, 400);
    }

    const tenant = await tenantService.getTenantBySlug(slug);

    if (!tenant) {
      return c.json({ 
        success: false, 
        message: 'Tenant no encontrado' 
      }, 404);
    }

    return c.json({
      success: true,
      data: tenant
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener la información del tenant'
    }, 500);
  }
};

/**
 * GET /api/client/menu/:slug
 * Obtener todas las categorías y productos de un tenant agrupados por categoría
 */
export const getMenuByCategoryController = async (c: Context) => {
  try {
    const slug = c.req.param('slug');
    if (!slug) {
      return c.json({ success: false, message: 'Slug requerido' }, 400);
    }

    const categoriesWithProducts = await tenantService.getMenuByCategory(slug);

    if (!categoriesWithProducts) {
      return c.json({ 
        success: false, 
        message: 'Tenant no encontrado' 
      }, 404);
    }

    return c.json({
      success: true,
      data: categoriesWithProducts
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener el menú'
    }, 500);
  }
};

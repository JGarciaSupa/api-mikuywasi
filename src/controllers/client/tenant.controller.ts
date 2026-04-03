import type { Context } from 'hono';
import { db } from '../../db';
import { tenants, categories } from '../../db/schema';
import { eq, and } from 'drizzle-orm';

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

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
      with: {
        banners: {
          orderBy: (banners: any, { asc }: any) => [asc(banners.order)],
        },
        socialLinks: {
          orderBy: (socialLinks: any, { asc }: any) => [asc(socialLinks.order)],
        }
      }
    });

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

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
      columns: {
        id: true,
      }
    });

    if (!tenant) {
      return c.json({ 
        success: false, 
        message: 'Tenant no encontrado' 
      }, 404);
    }

    const categoriesWithProducts = await db.query.categories.findMany({
      where: and(
        eq(categories.tenantId, tenant.id),
        eq(categories.isActive, true)
      ),
      orderBy: (categories, { asc }) => [asc(categories.order)],
      with: {
        products: {
          where: (products : any, { eq }: any) => eq(products.isActive, true),
          orderBy: (products: any, { asc }: any) => [asc(products.order)],
        }
      }
    });

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

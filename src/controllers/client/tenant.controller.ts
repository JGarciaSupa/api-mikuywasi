import type { Context } from 'hono';
import { db } from '../../db';
import { tenants } from '../../db/schema';
import { eq } from 'drizzle-orm';

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

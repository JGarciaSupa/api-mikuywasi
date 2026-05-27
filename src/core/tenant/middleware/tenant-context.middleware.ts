import type { Context, Next } from 'hono';
import { getTenantDb } from '../../../db';
import { runWithTenantContext } from '../../../utils/tenant-context';
import redisApi from '../../../redis/index';

export async function tenantContextMiddleware(c: Context, next: Next) {
  try {
    // Intentar obtener el tenant slug desde cabeceras, parámetros de ruta o query params
    const tenantIdHeader = c.req.header('X-Tenant-ID');
    const tenantSlugHeader = c.req.header('X-Tenant-Slug') || c.req.header('x-tenant-slug');
    const fallbackSlugFromIdHeader = tenantIdHeader && !/^\d+$/.test(tenantIdHeader) ? tenantIdHeader : undefined;
    
    const tenantSlug = tenantSlugHeader || fallbackSlugFromIdHeader || c.req.param('slug') || c.req.query('slug') || c.req.query('tenantSlug');

    if (!tenantSlug) {
      return c.json({ success: false, message: 'Tenant slug requerido' }, 400);
    }

    // Obtener tenant desde Redis (con fallback automático a Master DB si no está en caché)
    const tenant = await redisApi.getTenantBySlug(tenantSlug).catch(() => null);

    if (!tenant) {
      return c.json({ success: false, message: 'Tenant no encontrado' }, 404);
    }

    if (tenant.status === 'inactive') {
      return c.json({ success: false, message: 'Tenant inactivo' }, 403);
    }

    // Obtener la instancia de Drizzle para el tenant usando el dbUrl del caché
    const tenantDb = await getTenantDb(tenant.dbUrl);

    // Correr dentro del contexto de AsyncLocalStorage para que los controladores y servicios accedan a este tenantDb
    await runWithTenantContext({ tenantId: tenant.id, tenantDb }, () => next());
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al establecer contexto del tenant'
    }, 500);
  }
}


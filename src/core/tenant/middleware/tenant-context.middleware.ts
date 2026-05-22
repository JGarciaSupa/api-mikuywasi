import type { Context, Next } from 'hono';
import { masterDb } from '../../../db';
import { tenants } from '../../../db/master/schema';
import { eq, or } from 'drizzle-orm';
import { getTenantDb } from '../../../db';
import { runWithTenantContext } from '../../../utils/tenant-context';

export async function tenantContextMiddleware(c: Context, next: Next) {
  try {
    // Try to get tenantId from query param or header
    const tenantIdParam = c.req.query('tenantId') || c.req.header('X-Tenant-ID');
    // Try to get tenantSlug from path param or query
    const tenantSlug = c.req.param('slug') || c.req.query('slug');

    let tenant;

    if (tenantIdParam) {
      const tenantId = parseInt(tenantIdParam);
      if (isNaN(tenantId)) {
        return c.json({ success: false, message: 'Tenant ID inválido' }, 400);
      }
      tenant = await masterDb.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        with: { server: true }
      });
    } else if (tenantSlug) {
      tenant = await masterDb.query.tenants.findFirst({
        where: eq(tenants.slug, tenantSlug),
        with: { server: true }
      });
    } else {
      return c.json({ success: false, message: 'Tenant ID o slug requerido' }, 400);
    }

    if (!tenant) {
      return c.json({ success: false, message: 'Tenant no encontrado' }, 404);
    }

    if (!tenant.server) {
      return c.json({ success: false, message: 'Servidor de base de datos no configurado' }, 500);
    }

    const dbHost = process.env.DB_HOST_OVERRIDE || tenant.server.dbHost;
    const connectionString = `postgres://${encodeURIComponent(tenant.server.dbUser)}:${encodeURIComponent(tenant.server.dbPassword)}@${dbHost}:${tenant.server.dbPort}/${tenant.dbName}`;

    const tenantDb = await getTenantDb(connectionString);

    await runWithTenantContext({ tenantId: tenant.id, tenantDb }, () => next());
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al establecer contexto del tenant'
    }, 500);
  }
}

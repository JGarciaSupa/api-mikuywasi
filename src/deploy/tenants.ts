import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { masterDb } from '../db';
import * as tenantSchema from '../db/tenant/schema';
import { runWithTenantContext } from '../utils/tenant-context';

export type TenantRow = Awaited<ReturnType<typeof listTenants>>[number];

export function listTenants() {
  return masterDb.query.tenants.findMany({ with: { server: true }, orderBy: (t, { asc }) => [asc(t.id)] });
}

/**
 * Ejecuta `fn` en cada tenant con su BD (y dentro del contexto de tenant, así los services que usan
 * getTenantDb() funcionan). Para tareas de despliegue: si un tenant falla, se lanza al final con la lista.
 */
export async function forEachTenant(
  fn: (db: NodePgDatabase<typeof tenantSchema>, tenant: TenantRow) => Promise<void>,
  log: (msg: string) => void = console.log,
) {
  const failed: string[] = [];
  for (const tenant of await listTenants()) {
    const host = process.env.DB_HOST_OVERRIDE || tenant.server.dbHost;
    const pool = new Pool({
      host,
      port: tenant.server.dbPort,
      user: tenant.server.dbUser,
      password: tenant.server.dbPassword,
      database: tenant.dbName,
      max: 1,
    });
    const db = drizzle(pool, { schema: tenantSchema });
    try {
      await runWithTenantContext({ tenantId: tenant.id, tenantDb: db }, () => fn(db, tenant));
      log(`   ✓ ${tenant.name}`);
    } catch (error: any) {
      failed.push(tenant.name);
      log(`   ✗ ${tenant.name}: ${error?.message || error}`);
    } finally {
      await pool.end().catch(() => {});
    }
  }
  if (failed.length > 0) throw new Error(`Falló en: ${failed.join(', ')}`);
}

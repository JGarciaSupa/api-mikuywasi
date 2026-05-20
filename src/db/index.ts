import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as masterSchema from './master/schema';
import * as tenantSchema from './tenant/schema';

const masterPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3
});

export const masterDb = drizzle(masterPool, { schema: masterSchema });

const MAX_CACHED_POOLS = 100;
const tenantPools = new Map<string, Pool>();

export async function getTenantDb(dbUrl: string) {
  if (tenantPools.has(dbUrl)) {
    const pool = tenantPools.get(dbUrl)!;
    tenantPools.delete(dbUrl);
    tenantPools.set(dbUrl, pool);
    return drizzle(pool, { schema: tenantSchema });
  }

  if (tenantPools.size >= MAX_CACHED_POOLS) {
    const oldestDbUrl = tenantPools.keys().next().value;
    if (oldestDbUrl) {
      const oldestPool = tenantPools.get(oldestDbUrl)!;
      oldestPool.end();
      tenantPools.delete(oldestDbUrl);
    }
  }

  const pool = new Pool({
    connectionString: dbUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  tenantPools.set(dbUrl, pool);

  return drizzle(pool, { schema: tenantSchema });
}

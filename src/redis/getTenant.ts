import { masterDb } from "@/db";
import { tenants } from "@/db/master/schema";
import { redis } from "@/utils/redis";
import { eq } from "drizzle-orm";

export interface CachedTenant {
  id: number;
  status: "active" | "inactive";
  name: string;
  planEndsAt: string | null;
  limits: any;
  dbUrl: string;
}

const getTenantBySlug = async (slug: string): Promise<CachedTenant> => {
  const cacheKey = `tenant:${slug}`;
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    return JSON.parse(cachedData) as CachedTenant;
  }

  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    with: { plan: true, server: true },
  });

  if (!tenant) {
    throw new Error('Tenant no encontrado');
  }

  const dbHost = tenant.server.dbHost;
  const optimizedTenant: CachedTenant = {
    id: tenant.id,
    status: tenant.status,
    name: tenant.name,
    planEndsAt: tenant.planEndsAt ? tenant.planEndsAt.toISOString() : null,
    limits: tenant.plan.features,
    dbUrl: `postgres://${encodeURIComponent(tenant.server.dbUser)}:${encodeURIComponent(tenant.server.dbPassword)}@${dbHost}:${tenant.server.dbPort}/${tenant.dbName}`
  };
  await redis.set(cacheKey, JSON.stringify(optimizedTenant), 'EX', 3600);
  return optimizedTenant;
};

export default getTenantBySlug;
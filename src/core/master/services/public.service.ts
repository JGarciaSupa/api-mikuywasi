import { masterDb } from "@/db";
import { tenants } from "@/db/schema";
import { redis } from "@/utils/redis";
import { eq } from "drizzle-orm";

export interface CachedTenant {
  id: number;
  status: string;
  dbName: string;
  planEndsAt: string | null;
  limits: {
    maxProducts: number;
  };
  dbConfig: {
    host: string;
    port: number;
  };
}

export const getTenantBySlug = async (slug: string): Promise<CachedTenant> => {
  const cacheKey = `tenant:${slug}`;

  console.log(`\n============================`);
  console.log(`🔍 Buscando Tenant: [${slug}]`);
  console.log(`============================`);

  // 1. Intentar obtener el tenant desde la caché de Redis
  console.time(`⏱️ [Redis GET] tenant:${slug}`);
  const cachedData = await redis.get(cacheKey);
  console.timeEnd(`⏱️ [Redis GET] tenant:${slug}`);

  if (cachedData) {
    console.log(`🟢 [Cache HIT] Servido directamente desde Redis`);
    return JSON.parse(cachedData) as CachedTenant;
  }

  console.log(`⚠️ [Cache MISS] No encontrado en Redis. Yendo a DB Master...`);

  // 2. Si no está en Redis, golpear la Base de Datos Master
  console.time(`⚡ [SQL Query] Drizzle tenants.findFirst`);
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    with: { plan: true, server: true },
  });
  console.timeEnd(`⚡ [SQL Query] Drizzle tenants.findFirst`);

  if (!tenant) {
    console.log(`❌ [Error] Tenant '${slug}' no existe en la base de datos.`);
    throw new Error('Tenant no encontrado');
  }

  // 3. Estructurar ÚNICAMENTE los datos necesarios para el control operativo
  const optimizedTenant: CachedTenant = {
    id: tenant.id,
    status: tenant.status,
    dbName: tenant.dbName,
    planEndsAt: tenant.planEndsAt ? tenant.planEndsAt.toISOString() : null,
    limits: {
      maxProducts: (tenant.plan?.features as any)?.products ?? 100,
    },
    dbConfig: {
      host: tenant.server.dbHost,
      port: tenant.server.dbPort,
    },
  };

  // 4. Guardar en Redis con un tiempo de vida (TTL) de 1 hora
  console.time(`💾 [Redis SET] Guardando caché`);
  await redis.set(cacheKey, JSON.stringify(optimizedTenant), 'EX', 3600);
  console.timeEnd(`💾 [Redis SET] Guardando caché`);

  console.log(`💾 [Redis] Datos cacheados por 3600s para el slug: ${slug}`);

  return optimizedTenant;
};
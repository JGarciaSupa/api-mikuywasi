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

export const getTenantBySlug = async (slug: string) => {
  const cacheKey = `tenant:${slug}`;

  // 1. Intentar obtener el tenant desde la caché de Redis
  const cachedData = await redis.get(cacheKey);
  if (cachedData) {
    return JSON.parse(cachedData) as CachedTenant;
  }

  // 2. Si no está en Redis, golpear la Base de Datos Master
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    with: { plan: true, server: true },
  });

  if (!tenant) {
    throw new Error('Tenant no encontrado');
  }

  // 3. Estructurar ÚNICAMENTE los datos necesarios para el control operativo
  const optimizedTenant: CachedTenant = {
    id: tenant.id,
    status: tenant.status,
    dbName: tenant.dbName,
    planEndsAt: tenant.planEndsAt ? tenant.planEndsAt.toISOString() : null,
    limits: {
      // Manejo de fallback por si features viene vacío o no tiene products
      maxProducts: (tenant.plan?.features as any)?.products ?? 100,
    },
    dbConfig: {
      host: tenant.server.dbHost,
      port: tenant.server.dbPort,
    },
  };

  // 4. Guardar en Redis con un tiempo de vida (TTL). 
  // Ejemplo: 1 hora (3600 segundos) para que se auto-refresque si hay cambios
  await redis.set(cacheKey, JSON.stringify(optimizedTenant), 'EX', 3600);

  return optimizedTenant;
};
import { masterDb } from "@/db";
import { tenants, dbServers } from "@/db/master/schema";
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

// Lo que se guarda en Redis: sin credenciales de BD (antes se cacheaba el dbUrl con la contraseña).
interface RedisTenant {
  id: number;
  status: "active" | "inactive";
  name: string;
  planEndsAt: string | null;
  limits: any;
  serverId: number;
  dbName: string;
}

interface ServerCredentials {
  dbUser: string;
  dbPassword: string;
  dbHost: string;
  dbPort: number;
}

// Credenciales del servidor de BD solo en memoria del proceso (10 min), nunca en Redis.
const SERVER_TTL_MS = 10 * 60 * 1000;
const serverCache = new Map<number, { creds: ServerCredentials; expiresAt: number }>();

const getServerCredentials = async (serverId: number): Promise<ServerCredentials> => {
  const cached = serverCache.get(serverId);
  if (cached && cached.expiresAt > Date.now()) return cached.creds;

  const [server] = await masterDb
    .select({ dbUser: dbServers.dbUser, dbPassword: dbServers.dbPassword, dbHost: dbServers.dbHost, dbPort: dbServers.dbPort })
    .from(dbServers)
    .where(eq(dbServers.id, serverId));
  if (!server) throw new Error('Servidor de BD del tenant no encontrado');

  serverCache.set(serverId, { creds: server, expiresAt: Date.now() + SERVER_TTL_MS });
  return server;
};

const toCachedTenant = (t: RedisTenant, creds: ServerCredentials): CachedTenant => {
  const dbHost = process.env.DB_HOST_OVERRIDE || creds.dbHost;
  return {
    id: t.id,
    status: t.status,
    name: t.name,
    planEndsAt: t.planEndsAt,
    limits: t.limits,
    dbUrl: `postgres://${encodeURIComponent(creds.dbUser)}:${encodeURIComponent(creds.dbPassword)}@${dbHost}:${creds.dbPort}/${t.dbName}`,
  };
};

const getTenantBySlug = async (slug: string): Promise<CachedTenant> => {
  const cacheKey = `tenant:${slug}`;

  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      const parsed = JSON.parse(cachedData) as Partial<RedisTenant>;
      // Entradas antiguas (con dbUrl y sin serverId) se ignoran y se sobrescriben abajo
      if (typeof parsed.serverId === 'number' && typeof parsed.dbName === 'string') {
        const t = parsed as RedisTenant;
        return toCachedTenant(t, await getServerCredentials(t.serverId));
      }
    }
  } catch {
    // Redis caído — continúa con la DB directamente
  }

  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    with: { plan: true, server: true },
  });

  if (!tenant) {
    throw new Error('Tenant no encontrado');
  }

  const redisTenant: RedisTenant = {
    id: tenant.id,
    status: tenant.status,
    name: tenant.name,
    planEndsAt: tenant.planEndsAt ? tenant.planEndsAt.toISOString() : null,
    limits: tenant.plan.features,
    serverId: tenant.server.id,
    dbName: tenant.dbName,
  };
  const creds: ServerCredentials = {
    dbUser: tenant.server.dbUser,
    dbPassword: tenant.server.dbPassword,
    dbHost: tenant.server.dbHost,
    dbPort: tenant.server.dbPort,
  };
  serverCache.set(tenant.server.id, { creds, expiresAt: Date.now() + SERVER_TTL_MS });

  try {
    await redis.set(cacheKey, JSON.stringify(redisTenant), 'EX', 3600);
  } catch {
    // Redis caído — retorna sin cachear, el próximo request reintentará
  }

  return toCachedTenant(redisTenant, creds);
};

export default getTenantBySlug;
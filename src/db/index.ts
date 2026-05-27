import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as masterSchema from './master/schema';
import * as tenantSchema from './tenant/schema';

const masterPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3
});

export const masterDb = drizzle(masterPool, { schema: masterSchema });
export const db = masterDb;

// Definición de la estructura de caché para evitar reinstanciar Drizzle
type TenantDbInstance = NodePgDatabase<typeof tenantSchema>;
interface TenantConnection {
  pool: Pool;
  db: TenantDbInstance;
}

const MAX_CACHED_POOLS = 100;
const tenantConnections = new Map<string, TenantConnection>();

export async function getTenantDb(dbUrl: string): Promise<TenantDbInstance> {
  // Si la conexión ya existe, la movemos al final del Map (LRU) y la retornamos directamente sin reinstanciar Drizzle
  if (tenantConnections.has(dbUrl)) {
    const connection = tenantConnections.get(dbUrl)!;
    tenantConnections.delete(dbUrl);
    tenantConnections.set(dbUrl, connection);
    return connection.db;
  }

  // Si superamos el límite, cerramos el pool más antiguo para liberar recursos de forma asíncrona
  if (tenantConnections.size >= MAX_CACHED_POOLS) {
    const oldestDbUrl = tenantConnections.keys().next().value;
    if (oldestDbUrl) {
      const oldestConnection = tenantConnections.get(oldestDbUrl)!;
      // Cerramos el pool de conexiones asincrónicamente y manejamos errores silenciosamente
      oldestConnection.pool.end().catch((err) => {
        console.error(`[getTenantDb] Error al cerrar pool del tenant antiguo:`, err);
      });
      tenantConnections.delete(oldestDbUrl);
    }
  }

  // Crear un nuevo Pool optimizado para el Tenant
  const pool = new Pool({
    connectionString: dbUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Instanciar Drizzle solo una vez
  const dbInstance = drizzle(pool, { schema: tenantSchema });

  // Guardar la conexión completa en caché
  tenantConnections.set(dbUrl, { pool, db: dbInstance });

  return dbInstance;
}


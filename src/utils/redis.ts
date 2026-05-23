import Redis from 'ioredis';

// Cargar variables de entorno específicas para Redis
const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;
const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

console.log('[Redis] Configurando conexión...');

// Configuración de la instancia de Redis
const connectionOptions = redisUrl
  ? {
    path: undefined,
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  }
  : {
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    db: redisDb,
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  };

// Crear cliente de Redis
export const redis = redisUrl ? new Redis(redisUrl, connectionOptions) : new Redis(connectionOptions);

// Monitoreo de eventos de conexión
redis.on('connect', () => {
  console.log('[Redis] Cliente conectándose al servidor...');
});

redis.on('ready', () => {
  console.log('[Redis] ¡Conexión establecida y lista para operar!');
});

redis.on('error', (err) => {
  console.error('[Redis] Error de conexión:', err.message || err);
});

redis.on('close', () => {
  console.warn('[Redis] Conexión cerrada.');
});

redis.on('reconnecting', (delay: number) => {
  console.log(`[Redis] Reconectando en ${delay}ms...`);
});

redis.on('end', () => {
  console.error('[Redis] La conexión de Redis ha finalizado de forma permanente.');
});

/**
 * Utilidades de caché simplificadas con serialización automática a JSON.
 */
export const cache = {
  /**
   * Obtiene un valor de la caché.
   * @param key Clave de búsqueda
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      console.error(`[Redis Cache] Error obteniendo clave "${key}":`, error);
      return null;
    }
  },

  /**
   * Guarda un valor en la caché con serialización automática a JSON.
   * @param key Clave de guardado
   * @param value Valor a almacenar
   * @param ttlSeconds Tiempo de vida opcional en segundos
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<'OK' | null> {
    try {
      const serializedValue = JSON.stringify(value);
      if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
        return await redis.set(key, serializedValue, 'EX', ttlSeconds);
      }
      return await redis.set(key, serializedValue);
    } catch (error) {
      console.error(`[Redis Cache] Error guardando clave "${key}":`, error);
      return null;
    }
  },

  /**
   * Elimina una clave de la caché.
   * @param key Clave a eliminar
   */
  async del(key: string): Promise<number> {
    try {
      return await redis.del(key);
    } catch (error) {
      console.error(`[Redis Cache] Error eliminando clave "${key}":`, error);
      return 0;
    }
  },

  /**
   * Incrementa un valor numérico.
   * @param key Clave del valor
   */
  async incr(key: string): Promise<number> {
    try {
      return await redis.incr(key);
    } catch (error) {
      console.error(`[Redis Cache] Error incrementando clave "${key}":`, error);
      return 0;
    }
  },

  /**
   * Decrementa un valor numérico.
   * @param key Clave del valor
   */
  async decr(key: string): Promise<number> {
    try {
      return await redis.decr(key);
    } catch (error) {
      console.error(`[Redis Cache] Error decrementando clave "${key}":`, error);
      return 0;
    }
  },

  /**
   * Verifica si existe una clave.
   * @param key Clave a verificar
   */
  async exists(key: string): Promise<boolean> {
    try {
      const count = await redis.exists(key);
      return count > 0;
    } catch (error) {
      console.error(`[Redis Cache] Error verificando existencia de "${key}":`, error);
      return false;
    }
  },

  /**
   * Asigna un tiempo de expiración a una clave.
   * @param key Clave
   * @param seconds Tiempo de expiración en segundos
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await redis.expire(key, seconds);
      return result === 1;
    } catch (error) {
      console.error(`[Redis Cache] Error asignando expiración a "${key}":`, error);
      return false;
    }
  },

  /**
   * Elimina de forma eficiente (no bloqueante) todas las claves que coincidan con un prefijo.
   * Utiliza SCAN en lugar de KEYS para evitar degradación de rendimiento.
   * @param prefix Prefijo de las claves (ej. "tenant:1:orders")
   */
  async delByPrefix(prefix: string): Promise<number> {
    try {
      const stream = redis.scanStream({
        match: `${prefix}*`,
        count: 100, // Procesar en bloques de 100
      });

      let deletedCount = 0;

      for await (const keys of stream) {
        if (keys.length > 0) {
          const count = await redis.del(...keys);
          deletedCount += count;
        }
      }

      if (deletedCount > 0) {
        console.log(`[Redis Cache] Se eliminaron ${deletedCount} claves con prefijo "${prefix}"`);
      }
      return deletedCount;
    } catch (error) {
      console.error(`[Redis Cache] Error eliminando claves con prefijo "${prefix}":`, error);
      return 0;
    }
  },
};

import { RedisClient } from "bun";

export const redis = new RedisClient(process.env.REDIS_URL!);

console.log('[Redis] Cliente nativo de Bun conectado vía REDIS_URL');

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
      const result = await redis.exists(key);
      return Boolean(result);
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
      return Boolean(result);
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
      let cursor = '0';
      let deletedCount = 0;

      do {
        // El cliente nativo de Bun usa: redis.scan(cursor, "MATCH", pattern, "COUNT", n)
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          const count = await redis.del(...keys);
          deletedCount += count;
        }
      } while (cursor !== '0');

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

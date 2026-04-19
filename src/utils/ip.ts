import { Context } from 'hono';
import { getConnInfo } from 'hono/bun';

/**
 * Obtiene la IP real del cliente, manejando proxies (Cloudflare) y entornos locales.
 * @param c Contexto de Hono
 * @returns La dirección IP del cliente o '0.0.0.0' si no se detecta.
 */
export const getClientIp = (c: Context): string => {
  // Cloudflare usa 'cf-connecting-ip' por defecto. 
  // Es el estándar de oro si usas su proxy.
  const rawIp = 
    c.req.header('cf-connecting-ip') || 
    c.req.header('x-forwarded-for')?.split(',')[0] || 
    getConnInfo(c).remote.address || 
    '0.0.0.0';

  const ipAddress = rawIp.includes('::ffff:') 
    ? rawIp.split('::ffff:')[1] 
    : rawIp;

  return ipAddress;
};

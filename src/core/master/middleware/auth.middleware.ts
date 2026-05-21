import type { Context, Next } from 'hono';
import { verifyAccessToken, type JwtPayload } from '../utils/jwt';

// Extend Hono context variables for master module
declare module 'hono' {
  interface ContextVariableMap {
    masterPayload: JwtPayload;
  }
}

/**
 * Middleware de autenticación exclusivo para el módulo master (super-admins).
 * Verifica JWT y requiere que el rol sea 'super-admin'.
 */
export async function masterAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Token no proporcionado' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);

    if (payload.role !== 'super-admin') {
      return c.json({ success: false, message: 'Acceso restringido a super-admins' }, 403);
    }

    c.set('masterPayload', payload);
    c.set('jwtPayload' as never, payload);
    await next();
  } catch {
    return c.json({ success: false, message: 'Token inválido o expirado' }, 401);
  }
}

import type { Context, Next } from 'hono';
import { verifyAccessToken, type JwtPayload } from '../utils/jwt';

// Extend Hono context variables
declare module 'hono' {
  interface ContextVariableMap {
    jwtPayload: JwtPayload;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Token no proporcionado' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);
    c.set('jwtPayload', payload);
    await next();
  } catch {
    return c.json({ success: false, message: 'Token inválido o expirado' }, 401);
  }
}

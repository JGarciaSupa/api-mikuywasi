import type { Context, Next } from 'hono';
import { verifyAccessToken, type JwtPayload } from '../../../utils/jwt';

// Extend Hono context variables
declare module 'hono' {
  interface ContextVariableMap {
    jwtPayload: JwtPayload;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ status: false, message: 'Token no proporcionado' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);
    c.set('jwtPayload', payload);
    await next();
  } catch {
    return c.json({ status: false, message: 'Token inválido o expirado' }, 401);
  }
}

export function roleMiddleware(roles: string[]) {
  return async (c: Context, next: Next) => {
    const payload = c.get('jwtPayload');
    if (!payload || !roles.includes(payload.role)) {
      return c.json({ status: false, message: 'No tienes permisos para realizar esta acción' }, 403);
    }
    await next();
  };
}

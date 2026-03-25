import { getCookie } from 'hono/cookie';
import { verifyToken } from '../utils/jwt';
import { verify } from 'hono/jwt';

const JWT_SECRET = process.env.JWT_SECRET!;

/**
 * Middleware for Admin routes
 */
export const adminAuthMiddleware = async (c: any, next: any) => {
  const token = getCookie(c, 'adminAccessToken') || c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyToken(token) as any;
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('jwtPayload', payload);
  c.set('tenantId', payload.tenantId as number);
  await next();
};

/**
 * Middleware for Super Admin routes
 */
export const superAdminAuthMiddleware = async (c: any, next: any) => {
  const token = getCookie(c, 'accessToken');
  
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = await verify(token, JWT_SECRET, 'HS256');
    c.set('jwtPayload', payload);
    await next();
  } catch (error) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
};

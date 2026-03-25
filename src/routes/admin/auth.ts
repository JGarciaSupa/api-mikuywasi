import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { users } from "../../db/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { 
  generateAccessToken, 
  generateRefreshToken, verifyToken 
} from '../../utils/jwt';

const routes = new Hono();

routes.post('/web/login', async (c) => {
  const { email, password } = await c.req.json();
  
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const isPasswordValid = await Bun.password.verify(password, user.password).catch(() => user.password === password);

  if (!isPasswordValid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  if (user.role !== 'admin') {
    return c.json({ error: 'Access denied' }, 403);
  }

  const payload = {
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
  };

  const accessToken = await generateAccessToken(payload);
  const refreshToken = await generateRefreshToken({ id: user.id });

  setCookie(c, 'adminAccessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 15, // 15 min
  });

  setCookie(c, 'adminRefreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return c.json({ 
    success: true, 
    user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId } 
  });
});

routes.post('/web/refresh-token', async (c) => {
  const refreshToken = getCookie(c, 'adminRefreshToken');
  if (!refreshToken) return c.json({ error: 'No refresh token' }, 401);

  const payload = await verifyToken(refreshToken) as any;
  if (!payload || !payload.id) return c.json({ error: 'Invalid refresh token' }, 401);

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.id),
  });

  if (!user || user.role !== 'admin') return c.json({ error: 'Invalid user' }, 401);

  const newPayload = {
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
  };

  const newAccessToken = await generateAccessToken(newPayload);
  const newRefreshToken = await generateRefreshToken({ id: user.id });

  setCookie(c, 'adminAccessToken', newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 15,
  });

  setCookie(c, 'adminRefreshToken', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return c.json({ success: true });
});

// Mobile Auth Endpoints
routes.post('/mobile/login', async (c) => {
  const { email, password } = await c.req.json();
  
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) return c.json({ error: 'Invalid credentials' }, 401);

  const isPasswordValid = await Bun.password.verify(password, user.password).catch(() => user.password === password);
  if (!isPasswordValid) return c.json({ error: 'Invalid credentials' }, 401);

  if (user.role !== 'admin') return c.json({ error: 'Access denied' }, 403);

  const payload = {
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
  };

  const accessToken = await generateAccessToken(payload);
  const refreshToken = await generateRefreshToken({ id: user.id });

  return c.json({ 
    success: true, 
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId } 
  });
});

routes.post('/mobile/refresh-token', async (c) => {
  const { refreshToken } = await c.req.json();
  if (!refreshToken) return c.json({ error: 'No refresh token' }, 401);

  const payload = await verifyToken(refreshToken) as any;
  if (!payload || !payload.id) return c.json({ error: 'Invalid refresh token' }, 401);

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.id),
  });

  if (!user || user.role !== 'admin') return c.json({ error: 'Invalid user' }, 401);

  const newPayload = {
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
  };

  const newAccessToken = await generateAccessToken(newPayload);
  const newRefreshToken = await generateRefreshToken({ id: user.id });

  return c.json({ 
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  });
});

routes.post('/logout', (c) => {
  deleteCookie(c, 'adminAccessToken');
  deleteCookie(c, 'adminRefreshToken');
  return c.json({ success: true });
});

export default routes;
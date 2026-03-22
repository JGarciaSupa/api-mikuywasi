import { Hono } from 'hono';
import { db } from '../db';
import { tenants, plans, superAdmins } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { sign, verify } from 'hono/jwt';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';

const superAdmin = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Middleware to protect routes
const authMiddleware = async (c: any, next: any) => {
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

// Auth
superAdmin.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  
  const admin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.email, email),
  });

  if (!admin || admin.password !== password) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const payload = {
    id: admin.id,
    email: admin.email,
    exp: Math.floor(Date.now() / 1000) + 60 * 15, // 15 minutes
  };

  const refreshPayload = {
    id: admin.id,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
  };

  const accessToken = await sign(payload, JWT_SECRET);
  const refreshToken = await sign(refreshPayload, JWT_SECRET);

  setCookie(c, 'accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 15,
  });

  setCookie(c, 'refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return c.json({ 
    success: true, 
    user: { id: admin.id, name: admin.name, email: admin.email } 
  });
});

superAdmin.post('/refresh-token', async (c) => {
  const refreshToken = getCookie(c, 'refreshToken');

  if (!refreshToken) {
    return c.json({ error: 'No refresh token' }, 401);
  }

  try {
    const payload = await verify(refreshToken, JWT_SECRET, 'HS256') as any;
    
    const admin = await db.query.superAdmins.findFirst({
      where: eq(superAdmins.id, payload.id),
    });

    if (!admin) {
      return c.json({ error: 'Admin not found' }, 401);
    }

    const newAccessTokenPayload = {
      id: admin.id,
      email: admin.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 15,
    };

    const newAccessToken = await sign(newAccessTokenPayload, JWT_SECRET);

    setCookie(c, 'accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 15,
    });

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Invalid refresh token' }, 401);
  }
});

superAdmin.post('/logout', (c) => {
  deleteCookie(c, 'accessToken');
  deleteCookie(c, 'refreshToken');
  return c.json({ success: true });
});

superAdmin.get('/me', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload') as any;
  const admin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.id, payload.id),
  });

  if (!admin) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ id: admin.id, name: admin.name, email: admin.email });
});

// Tenants - Protected
superAdmin.get('/tenants', authMiddleware, async (c) => {
  const allTenants = await db.query.tenants.findMany({
    with: {
      plan: true,
    },
    orderBy: [desc(tenants.createdAt)],
  });
  return c.json(allTenants);
});

superAdmin.post('/tenants', authMiddleware, async (c) => {
  const body = await c.req.json();
  try {
    const [newTenant] = await db.insert(tenants).values({
      name: body.name,
      slug: body.slug,
      planId: body.planId || null,
      status: body.status || 'active',
      trialEnding: body.trialEnding ? new Date(body.trialEnding) : null,
    }).returning();
    return c.json(newTenant, 201);
  } catch (error) {
    return c.json({ error: 'Failed to create tenant' }, 500);
  }
});

superAdmin.patch('/tenants/:id/status', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  const { status } = await c.req.json();
  
  await db.update(tenants)
    .set({ status })
    .where(eq(tenants.id, id));
    
  return c.json({ success: true });
});

superAdmin.patch('/tenants/:id/trial', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  const { trialEnding } = await c.req.json();
  
  await db.update(tenants)
    .set({ trialEnding: new Date(trialEnding) })
    .where(eq(tenants.id, id));
    
  return c.json({ success: true });
});

// Plans - Protected
superAdmin.get('/plans', authMiddleware, async (c) => {
  const allPlans = await db.query.plans.findMany({
    orderBy: [plans.order],
  });
  return c.json(allPlans);
});

superAdmin.post('/plans', authMiddleware, async (c) => {
  const body = await c.req.json();
  const [newPlan] = await db.insert(plans).values({
    name: body.name,
    monthlyPrice: body.monthlyPrice,
    yearlyPrice: body.yearlyPrice,
    features: body.features,
    order: body.order,
  }).returning();
  return c.json(newPlan, 201);
});

export default superAdmin;

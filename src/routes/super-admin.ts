import { Hono } from 'hono';
import { db } from '../db';
import { tenants, plans, superAdmins } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

const superAdmin = new Hono();

// Auth
superAdmin.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  
  const admin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.email, email),
  });

  if (!admin || admin.password !== password) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  return c.json({ success: true, user: { id: admin.id, name: admin.name, email: admin.email } });
});

// Tenants
superAdmin.get('/tenants', async (c) => {
  const allTenants = await db.query.tenants.findMany({
    with: {
      plan: true,
    },
    orderBy: [desc(tenants.createdAt)],
  });
  return c.json(allTenants);
});

superAdmin.post('/tenants', async (c) => {
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

superAdmin.patch('/tenants/:id/status', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { status } = await c.req.json();
  
  await db.update(tenants)
    .set({ status })
    .where(eq(tenants.id, id));
    
  return c.json({ success: true });
});

superAdmin.patch('/tenants/:id/trial', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { trialEnding } = await c.req.json();
  
  await db.update(tenants)
    .set({ trialEnding: new Date(trialEnding) })
    .where(eq(tenants.id, id));
    
  return c.json({ success: true });
});

// Plans
superAdmin.get('/plans', async (c) => {
  const allPlans = await db.query.plans.findMany({
    orderBy: [plans.order],
  });
  return c.json(allPlans);
});

superAdmin.post('/plans', async (c) => {
  const body = await c.req.json();
  const [newPlan] = await db.insert(plans).values({
    name: body.name,
    price: body.price,
    oldPrice: body.oldPrice,
    features: body.features,
    order: body.order,
  }).returning();
  return c.json(newPlan, 201);
});

export default superAdmin;

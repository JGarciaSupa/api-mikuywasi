import { Hono } from 'hono';
import { db } from '../../db';
import { tenants } from '../../db/schema';
import { eq } from 'drizzle-orm';

const routes = new Hono();

// Tenant Endpoints
routes.get('/tenant/:slug', async (c) => {
  const slug = c.req.param('slug');

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
  });

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  return c.json(tenant);
});

export default routes;

import { Hono } from "hono";
import { db } from "../../db";
import { adminAuthMiddleware } from "../../middleware/auth";
import { eq, and, asc } from "drizzle-orm";
import { categories } from "../../db/schema";

const routes = new Hono<{ Variables: { tenantId: number } }>();

routes.get('/categories', adminAuthMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const tenantCategories = await db.query.categories.findMany({
    where: eq(categories.tenantId, tenantId),
    orderBy: [asc(categories.order)],
  });
  return c.json(tenantCategories);
});

routes.post('/categories', adminAuthMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const { name, order, isActive, startTime, endTime, availableDays } = await c.req.json();
  
  const [newCategory] = await db.insert(categories).values({
    name: name as string,
    tenantId: tenantId,
    order: (order as number) || 0,
    isActive: isActive !== undefined ? isActive : true,
    startTime: startTime || null,
    endTime: endTime || null,
    availableDays: availableDays || [1,2,3,4,5,6,7],
  }).returning();

  return c.json(newCategory, 201);
});

routes.patch('/categories/:id', adminAuthMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));
  const { name, order, isActive, startTime, endTime, availableDays } = await c.req.json();

  const [updatedCategory] = await db.update(categories)
    .set({ name, order, isActive, startTime, endTime, availableDays })
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
    .returning();

  return c.json(updatedCategory);
});

routes.delete('/categories/:id', adminAuthMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));

  await db.delete(categories)
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)));

  return c.json({ success: true });
});

export default routes;
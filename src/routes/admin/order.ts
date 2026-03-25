import { Hono } from "hono";
import { adminAuthMiddleware } from "../../middleware/auth";
import { db } from "../../db";
import { and, desc, eq } from "drizzle-orm";
import { orders } from "../../db/schema";

const routes = new Hono<{ Variables: { jwtPayload: any, tenantId: number } }>();

routes.get('/orders', adminAuthMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const tenantOrders = await db.query.orders.findMany({
    where: eq(orders.tenantId, tenantId),
    with: {
      items: {
        with: {
          product: true,
          sides: true,
        }
      }
    },
    orderBy: [desc(orders.createdAt)],
  });
  return c.json(tenantOrders);
});

routes.patch('/orders/:id/status', adminAuthMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));
  const { status } = await c.req.json();

  const [updatedOrder] = await db.update(orders)
    .set({ status })
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .returning();

  return c.json(updatedOrder);
});

export default routes;
import { Hono } from 'hono';
import { db } from '../db';
import { tenants, orders, orderItems } from '../db/schema';
import { eq } from 'drizzle-orm';

const cliente = new Hono();

// Tenant Endpoints
cliente.get('/tenant/:slug', async (c) => {
  const slug = c.req.param('slug');
  
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    with: {
      banners: true,
      socialLinks: true,
      categories: {
        with: {
          products: {
            with: {
              alternatives: true,
              sides: true,
            },
          },
        },
      },
    },
  });

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  return c.json(tenant);
});

// Order Endpoints
cliente.post('/orders', async (c) => {
  const body = await c.req.json();
  const { tenantId, customerName, tableNumber, items, total } = body;

  try {
    const [newOrder] = await db.insert(orders).values({
      tenantId,
      customerName,
      tableNumber,
      total,
      status: 'pending',
    }).returning();

    for (const item of items) {
      await db.insert(orderItems).values({
        orderId: newOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        selectedAlternativeName: item.selectedAlternative?.name,
        selectedAlternativePrice: item.selectedAlternative?.price,
      });
    }

    return c.json({ success: true, orderId: newOrder.id }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to create order' }, 500);
  }
});

export default cliente;

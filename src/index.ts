import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { db } from './db';
import { tenants, categories, products, orders, orderItems } from './db/schema';
import { eq } from 'drizzle-orm';
import superAdminRoutes from './routes/super-admin';
import adminRoutes from './routes/admin';

const app = new Hono();

// Middleware
app.use('*', cors({
  origin: (origin) => origin,
  credentials: true,
}));

// Routes
app.route('/api/super-admin', superAdminRoutes);
app.route('/api/admin', adminRoutes);

// Health Check
app.get('/', (c) => c.text('Sistema Pedidos QR API is running!'));

// Tenant Endpoints
app.get('/api/tenant/:slug', async (c) => {
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
app.post('/api/orders', async (c) => {
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
      // Sides would need another loop if we were handling them in depth here
    }

    return c.json({ success: true, orderId: newOrder.id }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to create order' }, 500);
  }
});

const port = process.env.PORT || 3000;

export default {
  port,
  fetch: app.fetch,
};

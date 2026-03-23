import { Hono } from 'hono';
import { db } from '../db';
import { 
  tenants, 
  users, 
  categories, 
  products, 
  productAlternatives, 
  productSides, 
  orders, 
  banners, 
  socialLinks 
} from '../db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt';

type Variables = {
  jwtPayload: any;
  tenantId: number;
};

const admin = new Hono<{ Variables: Variables }>();

// Middleware to protect routes and inject tenantId
const authMiddleware = async (c: any, next: any) => {
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

// Auth
admin.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Support both hashed and plain text (for existing users if any, though they should be hashed)
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

admin.post('/refresh-token', async (c) => {
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
admin.post('/mobile/login', async (c) => {
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

admin.post('/mobile/refresh-token', async (c) => {
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

admin.post('/logout', (c) => {
  deleteCookie(c, 'adminAccessToken');
  deleteCookie(c, 'adminRefreshToken');
  return c.json({ success: true });
});

admin.get('/me', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.id),
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ 
    id: user.id, 
    name: user.name, 
    email: user.email, 
    tenantId: user.tenantId,
    role: user.role 
  });
});

// Profile Management
admin.get('/profile', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    with: {
      banners: true,
      socialLinks: true,
    }
  });

  return c.json(tenant);
});

admin.patch('/profile', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  
  const [updatedTenant] = await db.update(tenants)
    .set({
      name: body.name,
      logo: body.logo,
      primaryColor: body.primaryColor,
      secondaryColor: body.secondaryColor,
      accentColor: body.accentColor,
      phone: body.phone,
      whatsapp: body.whatsapp,
      email: body.email,
      address: body.address,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
    .returning();

  return c.json(updatedTenant);
});

// Categories
admin.get('/categories', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const tenantCategories = await db.query.categories.findMany({
    where: eq(categories.tenantId, tenantId),
    orderBy: [asc(categories.order)],
  });
  return c.json(tenantCategories);
});

admin.post('/categories', authMiddleware, async (c) => {
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

admin.patch('/categories/:id', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));
  const { name, order, isActive, startTime, endTime, availableDays } = await c.req.json();

  const [updatedCategory] = await db.update(categories)
    .set({ name, order, isActive, startTime, endTime, availableDays })
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
    .returning();

  return c.json(updatedCategory);
});

admin.delete('/categories/:id', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));

  await db.delete(categories)
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)));

  return c.json({ success: true });
});

// Products
admin.get('/products', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const tenantProducts = await db.query.products.findMany({
    where: eq(products.tenantId, tenantId),
    with: {
      alternatives: true,
      sides: true,
      category: true,
    },
    orderBy: [asc(products.order)],
  });
  return c.json(tenantProducts);
});

admin.post('/products', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const { alternatives, sides, ...productData } = body;

  try {
    const result = await db.transaction(async (tx) => {
      const [newProduct] = await tx.insert(products).values({
        name: productData.name as string,
        description: productData.description as string,
        price: productData.price as string,
        discountPrice: productData.discountPrice as string,
        image: productData.image as string,
        order: (productData.order as number) || 0,
        categoryId: productData.categoryId as number,
        tenantId,
        isActive: productData.isActive !== undefined ? productData.isActive : true,
      }).returning();

      if (alternatives && alternatives.length > 0) {
        await tx.insert(productAlternatives).values(
          alternatives.map((a: any) => ({ 
            name: a.name as string,
            price: a.price as string,
            productId: newProduct.id 
          }))
        );
      }

      if (sides && sides.length > 0) {
        await tx.insert(productSides).values(
          sides.map((s: any) => ({ 
            name: s.name as string,
            price: s.price as string,
            productId: newProduct.id 
          }))
        );
      }

      return newProduct;
    });

    return c.json(result, 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to create product' }, 500);
  }
});

admin.patch('/products/:id', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { alternatives, sides, ...productData } = body;

  try {
    const result = await db.transaction(async (tx) => {
      const [updatedProduct] = await tx.update(products)
        .set({
          name: productData.name as string,
          description: productData.description as string,
          price: productData.price as string,
          discountPrice: productData.discountPrice as string,
          image: productData.image as string,
          order: (productData.order as number) || 0,
          categoryId: productData.categoryId as number,
          isActive: productData.isActive,
        })
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
        .returning();

      if (alternatives) {
        await tx.delete(productAlternatives).where(eq(productAlternatives.productId, id));
        if (alternatives.length > 0) {
          await tx.insert(productAlternatives).values(
            alternatives.map((a: any) => ({ 
              name: a.name as string,
              price: a.price as string,
              productId: id 
            }))
          );
        }
      }

      if (sides) {
        await tx.delete(productSides).where(eq(productSides.productId, id));
        if (sides.length > 0) {
          await tx.insert(productSides).values(
            sides.map((s: any) => ({ 
              name: s.name as string,
              price: s.price as string,
              productId: id 
            }))
          );
        }
      }

      return updatedProduct;
    });

    return c.json(result);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to update product' }, 500);
  }
});

admin.delete('/products/:id', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));

  try {
    await db.transaction(async (tx) => {
      await tx.delete(productAlternatives).where(eq(productAlternatives.productId, id));
      await tx.delete(productSides).where(eq(productSides.productId, id));
      await tx.delete(products).where(and(eq(products.id, id), eq(products.tenantId, tenantId)));
    });
    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to delete product' }, 500);
  }
});

// Orders
admin.get('/orders', authMiddleware, async (c) => {
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

admin.patch('/orders/:id/status', authMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));
  const { status } = await c.req.json();

  const [updatedOrder] = await db.update(orders)
    .set({ status })
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .returning();

  return c.json(updatedOrder);
});

export default admin;

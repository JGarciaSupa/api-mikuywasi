import { Hono } from "hono";
import { adminAuthMiddleware } from "../../middleware/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { users } from "../../db/schema";

const routes = new Hono<{ Variables: { jwtPayload: any, tenantId: number } }>();

routes.get('/', adminAuthMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.id),
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ 
    success: true,
    user: {
      id: user.id, 
      name: user.name, 
      email: user.email, 
      tenantId: user.tenantId,
      role: user.role 
    }
  });
});

// Profile Management
// admin.get('/profile', authMiddleware, async (c) => {
//   const tenantId = c.get('tenantId');
//   const tenant = await db.query.tenants.findFirst({
//     where: eq(tenants.id, tenantId),
//     with: {
//       banners: true,
//       socialLinks: true,
//     }
//   });

//   return c.json(tenant);
// });

// admin.patch('/profile', authMiddleware, async (c) => {
//   const tenantId = c.get('tenantId');
//   const body = await c.req.json();
  
//   const [updatedTenant] = await db.update(tenants)
//     .set({
//       name: body.name,
//       logo: body.logo,
//       primaryColor: body.primaryColor,
//       secondaryColor: body.secondaryColor,
//       accentColor: body.accentColor,
//       phone: body.phone,
//       whatsapp: body.whatsapp,
//       email: body.email,
//       address: body.address,
//       updatedAt: new Date(),
//     })
//     .where(eq(tenants.id, tenantId))
//     .returning();

//   return c.json(updatedTenant);
// });

export default routes;
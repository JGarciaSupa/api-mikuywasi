import { Hono } from "hono";
import { adminAuthMiddleware } from "../../middleware/auth";
import { and, asc, eq } from "drizzle-orm";
import { productAlternatives, products, productSides } from "../../db/schema";
import { db } from "../../db";

const routes = new Hono<{ Variables: { jwtPayload: any, tenantId: number } }>();

routes.get('/products', adminAuthMiddleware, async (c) => {
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

routes.post('/products', adminAuthMiddleware, async (c) => {
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

routes.patch('/products/:id', adminAuthMiddleware, async (c) => {
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

routes.delete('/products/:id', adminAuthMiddleware, async (c) => {
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

export default routes;
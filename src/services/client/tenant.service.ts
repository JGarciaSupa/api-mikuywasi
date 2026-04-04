import { db } from '../../db';
import { tenants, categories, products, tables, paymentMethods } from '../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';

/**
 * Obtener información pública de un tenant por su slug
 */
export const getTenantBySlug = async (slug: string) => {
  return await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    with: {
      banners: {
        orderBy: (banners: any, { asc }: any) => [asc(banners.order)],
      },
      socialLinks: {
        orderBy: (socialLinks: any, { asc }: any) => [asc(socialLinks.order)],
      }
    }
  });
};

/**
 * Obtener todas las categorías y productos de un tenant agrupados por categoría.
 * También incluye productos sin categoría bajo una estructura con id y name en null.
 */
export const getMenuByCategory = async (slug: string) => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    columns: {
      id: true,
    }
  });

  if (!tenant) {
    return null;
  }

  const categoriesWithProducts = await db.query.categories.findMany({
    where: and(
      eq(categories.tenantId, tenant.id),
      eq(categories.isActive, true)
    ),
    orderBy: (categories, { asc }) => [asc(categories.order)],
    with: {
      products: {
        where: (products: any, { eq }: any) => eq(products.isActive, true),
        orderBy: (products: any, { asc }: any) => [asc(products.order)],
      }
    }
  });

  const productsWithoutCategory = await db.query.products.findMany({
    where: and(
      eq(products.tenantId, tenant.id),
      eq(products.isActive, true),
      isNull(products.categoryId)
    ),
    orderBy: (products, { asc }) => [asc(products.order)],
  });

  if (productsWithoutCategory.length > 0) {
    categoriesWithProducts.push({
      id: null,
      name: null,
      order: 999,
      isActive: true,
      tenantId: tenant.id,
      startTime: null,
      endTime: null,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      createdAt: new Date(),
      updatedAt: new Date(),
      products: productsWithoutCategory
    } as any);
  }

  return categoriesWithProducts;
};

/**
 * Obtener todas las mesas de un restaurante por su slug
 */
export const getTablesByTenantSlug = async (slug: string) => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    columns: {
      id: true,
    }
  });

  if (!tenant) {
    return null;
  }

  return await db.query.tables.findMany({
    where: eq(tables.tenantId, tenant.id),
    orderBy: (tables, { asc }) => [asc(tables.name)],
  });
};

/**
 * Obtener todos los métodos de pago activos de un restaurante por su slug
 */
export const getPaymentMethodsByTenantSlug = async (slug: string) => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    columns: {
      id: true,
    }
  });

  if (!tenant) {
    return null;
  }

  return await db.query.paymentMethods.findMany({
    where: and(
      eq(paymentMethods.tenantId, tenant.id),
      eq(paymentMethods.isActive, true)
    ),
    orderBy: (paymentMethods, { asc }) => [asc(paymentMethods.name)],
  });
};

import { db } from '../../db';
import { tenants, categories, products, tables, paymentMethods, orders, orderItems } from '../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

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

/**
 * Crear un nuevo pedido en la base de datos (con NanoID y transacción)
 */
export const createOrder = async (orderData: any) => {
  const { items } = orderData;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      // 1. Generar IDs únicos en cada intento
      const orderId = nanoid(12);
      const trackingCode = `ORD-${nanoid(8).toUpperCase()}`;

      return await db.transaction(async (tx) => {
        // 2. Crear la orden
        const [result] = await tx.insert(orders).values({
          id: orderId,
          tenantId: orderData.tenantId,
          customerName: orderData.customerName,
          customerPhone: orderData.customerPhone,
          customerAddress: orderData.customerAddress,
          deliveryType: orderData.deliveryType,
          deliveryInfo: orderData.deliveryInfo,
          tableId: orderData.tableId,
          tableName: orderData.tableName,
          paymentMethod: orderData.paymentMethod,
          notes: orderData.notes,
          subtotal: orderData.subtotal.toString(),
          deliveryFee: (orderData.deliveryFee || 0).toString(),
          total: orderData.total.toString(),
          trackingCode,
          status: 'pending',
          paymentStatus: 'unpaid',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        // 3. Crear los ítems
        if (items && items.length > 0) {
          await tx.insert(orderItems).values(
            items.map((item: any) => ({
              orderId: orderId,
              productId: item.productId,
              productName: item.productName,
              unitPrice: item.unitPrice.toString(),
              quantity: item.quantity,
              selectedAlternatives: item.selectedAlternatives || [],
              packagingFee: (item.packagingFee || 0).toString(),
              notes: item.notes,
              totalPrice: item.totalPrice.toString(),
            }))
          );
        }

        return { 
          ...result,
          items: items 
        };
      });
    } catch (error: any) {
      attempts++;
      
      // Si es un error de clave duplicada (Postgres: 23505) y no es el último intento
      if (error.code === '23505' && attempts < maxAttempts) {
        console.warn(`Colisión detectada. Reintento ${attempts}/${maxAttempts}...`);
        continue;
      }
      
      // Si es otro error o ya superamos los intentos, lanzamos
    }
  }
};

/**
 * Obtener detalle de una orden pública por trackingCode
 */
export const getOrderByTrackingCode = async (trackingCode: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.trackingCode, trackingCode));

  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return {
    ...order,
    items
  };
};

import { tenantConfigs, banners, socialLinks, categories, products, tables, paymentMethods, orders, orderItems } from '../../../../db/tenant/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getImageUrl } from '../../../../utils/r2';
import { getTenantDb } from '../../../../utils/tenant-context';

/**
 * Obtener información pública del tenant (config, banners, social links)
 */
export const getTenantInfo = async () => {
  const db = getTenantDb();

  const [config] = await db.select().from(tenantConfigs);

  const tenantBanners = await db.select().from(banners)
    .orderBy(banners.order);

  const tenantSocialLinks = await db.select().from(socialLinks)
    .orderBy(socialLinks.order);

  return {
    ...config,
    logo: getImageUrl(config?.logo ?? null),
    banners: tenantBanners.map((b: any) => ({ ...b, url: getImageUrl(b.url) })),
    socialLinks: tenantSocialLinks,
  };
};

/**
 * Obtener categorías y productos agrupados. Incluye productos sin categoría.
 */
export const getMenu = async () => {
  const db = getTenantDb();

  const categoriesWithProducts = await db.query.categories.findMany({
    where: eq(categories.isActive, true),
    orderBy: (cats, { asc }) => [asc(cats.order)],
    with: {
      products: {
        where: (p, { eq }) => eq(p.isActive, true),
        orderBy: (p, { asc }) => [asc(p.order)],
      }
    }
  });

  const productsWithoutCategory = await db.query.products.findMany({
    where: and(eq(products.isActive, true), isNull(products.categoryId)),
    orderBy: (p, { asc }) => [asc(p.order)],
  });

  const mapProducts = (list: any[]) => list.map(p => ({ ...p, image: getImageUrl(p.image) }));

  const result: any[] = categoriesWithProducts
    .map((cat) => ({ ...cat, products: mapProducts(cat.products) }))
    .filter((cat) => cat.products.length > 0);

  if (productsWithoutCategory.length > 0) {
    result.push({
      id: null,
      name: null,
      order: 999,
      isActive: true,
      startTime: null,
      endTime: null,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      createdAt: new Date(),
      updatedAt: new Date(),
      products: mapProducts(productsWithoutCategory)
    });
  }

  return result;
};

/**
 * Obtener mesas del restaurante
 */
export const getTables = async () => {
  const db = getTenantDb();
  return await db.select().from(tables).orderBy(tables.name);
};

/**
 * Obtener métodos de pago activos
 */
export const getPaymentMethods = async () => {
  const db = getTenantDb();
  return await db.select().from(paymentMethods)
    .where(eq(paymentMethods.isActive, true))
    .orderBy(paymentMethods.name);
};

/**
 * Crear un nuevo pedido (con NanoID y reintentos en colisión)
 */
export const createOrder = async (orderData: any) => {
  const db = getTenantDb();
  const { items } = orderData;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const orderId = nanoid(12);
      const trackingCode = `ORD-${nanoid(8).toUpperCase()}`;

      return await db.transaction(async (tx) => {
        const [result] = await tx.insert(orders).values({
          id: orderId,
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

        if (items && items.length > 0) {
          await tx.insert(orderItems).values(
            items.map((item: any) => ({
              orderId,
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

        return { ...result, items };
      });
    } catch (error: any) {
      attempts++;
      if (error.code === '23505' && attempts < maxAttempts) continue;
      throw error;
    }
  }
};

/**
 * Obtener orden pública por trackingCode
 */
export const getOrderByTrackingCode = async (trackingCode: string) => {
  const db = getTenantDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.trackingCode, trackingCode));

  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return { ...order, items };
};

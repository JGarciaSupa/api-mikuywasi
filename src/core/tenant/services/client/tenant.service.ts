import { tenantConfigs, banners, socialLinks, categories, products, tables, paymentMethods, orders, orderItems, recipes, recipeLines, items } from '../../../../db/tenant/schema';
import { eq, and, or, isNull, inArray, isNotNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getImageUrl } from '../../../../utils/r2';
import { getTenantDb } from '../../../../utils/tenant-context';

function toNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

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
export const getMenu = async (branchId?: number) => {
  const db = getTenantDb();

  const conditions = [eq(categories.isActive, true)];
  if (branchId) {
    const branchCondition = or(eq(categories.branchId, branchId), isNull(categories.branchId));
    if (branchCondition) {
      conditions.push(branchCondition);
    }
  }

  const categoriesWithProducts = await db.query.categories.findMany({
    where: and(...conditions),
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
 * Obtener mesas con estado operativo para mozo.
 * El estado "occupied" se calcula en base a pedidos dine_in activos.
 */
export const getWaiterTablesStatus = async (branchId?: number) => {
  const db = getTenantDb();

  const allTables = branchId
    ? await db.select().from(tables).where(eq(tables.branchId, branchId)).orderBy(tables.name)
    : await db.select().from(tables).orderBy(tables.name);

  const activeDineInConditions = [
    eq(orders.deliveryType, 'dine_in'),
    isNotNull(orders.tableId),
    inArray(orders.status, ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'dispatched']),
  ];

  if (branchId) {
    activeDineInConditions.push(eq(orders.branchId, branchId));
  }

  const activeDineInOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      tableId: orders.tableId,
      tableName: orders.tableName,
      trackingCode: orders.trackingCode,
      customerName: orders.customerName,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(...activeDineInConditions));

  const activeByTableId = new Map<number, any>();
  for (const order of activeDineInOrders) {
    if (order.tableId == null) continue;
    const prev = activeByTableId.get(order.tableId);
    const currentCreatedAt = order.createdAt ? new Date(order.createdAt).getTime() : 0;
    const prevCreatedAt = prev?.createdAt ? new Date(prev.createdAt).getTime() : 0;
    if (!prev || currentCreatedAt > prevCreatedAt) {
      activeByTableId.set(order.tableId, order);
    }
  }

  return allTables.map((table) => {
    const activeOrder = activeByTableId.get(table.id) ?? null;
    return {
      ...table,
      status: activeOrder ? 'occupied' : 'available',
      activeOrder: activeOrder
        ? {
          id: activeOrder.id,
          trackingCode: activeOrder.trackingCode,
          customerName: activeOrder.customerName,
          status: activeOrder.status,
          total: activeOrder.total,
          createdAt: activeOrder.createdAt,
        }
        : null,
    };
  });
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
export const createOrder = async (orderData: any, initialStatus: 'pending' | 'confirmed' | 'preparing' | 'dispatched' | 'ready_for_pickup' | 'completed' | 'cancelled' = 'pending') => {
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
          branchId: orderData.branchId ?? 1, // branchId requerido; el cliente debe enviarlo
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
          status: initialStatus,
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
 * Valida receta y stock antes de crear pedido.
 * Lanza Error si falta receta activa o no alcanza stock.
 */
export const validateOrderStockBeforeCreate = async (orderData: any) => {
  const db = getTenantDb();
  const requiredByItem = new Map<number, number>();
  const orderItemsInput = orderData?.items ?? [];

  for (const oi of orderItemsInput) {
    if (!oi?.productId) continue;

    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.productId, oi.productId), eq(recipes.isActive, true)))
      .limit(1);

    if (!recipe) {
      throw new Error(`El producto "${oi.productName}" no tiene receta activa para descargar stock.`);
    }

    const lines = await db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeId, recipe.id));

    const orderQty = toNum(oi.quantity);
    const servings = toNum(recipe.servings) || 1;
    const yieldFactor = (toNum(recipe.yieldPct) || 100) / 100;

    for (const rl of lines) {
      if (rl.isOptional) continue;
      const [item] = await db.select().from(items).where(eq(items.id, rl.itemId));
      if (!item?.recipeDischarge) continue;

      let ingredientQty = (toNum(rl.qty) / servings) * orderQty / yieldFactor;
      if (rl.isCost && toNum(item.conversionFactor) > 0) {
        ingredientQty = ingredientQty / toNum(item.conversionFactor);
      }

      requiredByItem.set(rl.itemId, (requiredByItem.get(rl.itemId) ?? 0) + ingredientQty);
    }
  }

  if (requiredByItem.size === 0) return;

  const missing: string[] = [];
  const requiredEntries = Array.from(requiredByItem.entries());
  for (const entry of requiredEntries) {
    const itemId = entry[0];
    const requiredQty = entry[1];
    const [stockItem] = await db.select().from(items).where(eq(items.id, itemId));
    if (!stockItem) continue;
    const current = toNum(stockItem.currentStock);
    if (requiredQty > current) {
      missing.push(
        `${stockItem.shortDescription}: requerido ${requiredQty.toFixed(3)}, disponible ${current.toFixed(3)}`
      );
    }
  }

  if (missing.length > 0) {
    throw new Error(`Stock insuficiente para procesar el pedido. ${missing.join(' | ')}`);
  }
};

/**
 * Descarga de stock inmediata al crear un pedido.
 * Se llama fire-and-forget: los errores de stock no bloquean al mozo.
 */
export const triggerStockDischargeForOrder = async (orderId: string): Promise<string[]> => {
  try {
    const { autoDischargeOnOrderCreated } = await import('../admin/warehouse/sales-discharge.service');
    await autoDischargeOnOrderCreated(orderId);
    return [];
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[stock] Descarga omitida para pedido ${orderId}: ${msg}`);
    return [msg];
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

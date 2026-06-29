import { tenantConfigs, banners, socialLinks, categories, products, tables, paymentMethods, orders, orderItems, orderItemExtras, productExtras, recipes, recipeLines, items, branches, branchRecipeAreas, stockSnapshot, storageAreas } from '../../../../db/tenant/schema';
import { eq, and, or, isNull, inArray, isNotNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getImageUrl } from '../../../../utils/r2';
import { getTenantDb } from '../../../../utils/tenant-context';
import { findPaymentMethodByName } from '../admin/config-local/payment-method.service';
import { writeAuditLog } from '../admin/warehouse/shared/audit.service';
import type { AuditActor } from '../admin/warehouse/types';

function toNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const roundMoney = (val: number) => Number(val.toFixed(2));
const roundQty = (val: number) => Number(val.toFixed(3));

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
export const createOrder = async (orderData: any, initialStatus: 'pending' | 'confirmed' | 'preparing' | 'dispatched' | 'ready_for_pickup' | 'completed' | 'cancelled' = 'pending', actor?: AuditActor) => {
  const db = getTenantDb();
  const { items } = orderData;
  const subtotal = roundMoney(toNum(orderData.subtotal));
  const deliveryFee = roundMoney(toNum(orderData.deliveryFee));
  const retentionPercentage = roundMoney(toNum(orderData.retentionPercentage));
  const retentionAmount = roundMoney(
    orderData.retentionAmount !== undefined
      ? toNum(orderData.retentionAmount)
      : ((subtotal + deliveryFee) * retentionPercentage) / 100
  );
  const total = roundMoney(subtotal + deliveryFee + retentionAmount);

  // Método de pago: en interno (POS) no se envía → null (se elige al cobrar).
  // En web el cliente sí envía su método previsto → se guarda + resuelve su id (relación estable).
  const pm = orderData.paymentMethod ? await findPaymentMethodByName(orderData.paymentMethod) : null;

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
          paymentMethod: orderData.paymentMethod ?? null, // null en interno; previsto en web
          paymentMethodId: pm?.id ?? null,
          notes: orderData.notes,
          cashSessionId: orderData.cashSessionId ?? null, // turno de caja (null en pedidos de cliente web)
          subtotal: subtotal.toFixed(2),
          deliveryFee: deliveryFee.toFixed(2),
          retentionPercentage: retentionPercentage.toFixed(2),
          retentionAmount: retentionAmount.toFixed(2),
          total: total.toFixed(2),
          trackingCode,
          status: initialStatus,
          paymentStatus: 'unpaid',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        if (items && items.length > 0) {
          const insertedItems = await tx.insert(orderItems).values(
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
          ).returning();

          // Guardar extras seleccionados por cada item
          for (let i = 0; i < insertedItems.length; i++) {
            const orderItem = insertedItems[i];
            const srcItem = items[i];
            if (!srcItem.extras?.length) continue;

            const extraIds = srcItem.extras.map((e: any) => e.extraId);
            const extrasData = await tx
              .select()
              .from(productExtras)
              .where(inArray(productExtras.id, extraIds));

            const extraRows = srcItem.extras
              .map((sel: any) => {
                const extra = extrasData.find((e) => e.id === sel.extraId);
                if (!extra) return null;
                const qty = sel.qty ?? 1;
                const unitPrice = parseFloat(extra.price);
                return {
                  orderItemId: orderItem.id,
                  extraId: sel.extraId,
                  qty,
                  unitPrice: unitPrice.toString(),
                  totalPrice: (unitPrice * qty).toString(),
                };
              })
              .filter(Boolean);

            if (extraRows.length) {
              await tx.insert(orderItemExtras).values(extraRows);
            }
          }
        }

        await writeAuditLog({
          tableName: 'orders',
          operation: 'INSERT',
          recordId: null,
          afterData: { id: result.id, total: result.total, customerName: result.customerName, tableName: result.tableName, status: result.status },
          userId: actor?.userId,
          userName: actor?.userName,
          module: 'pedidos',
          description: `Pedido #${result.id} registrado${result.tableName ? ` — Mesa ${result.tableName}` : result.customerName ? ` — ${result.customerName}` : ''} — Total S/ ${result.total}`,
        }, tx);

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
  const branchId = orderData.branchId ?? 1;

  // 1. Si la tienda/sucursal permite venta sin stock, saltar validación de inmediato
  const [branch] = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1);
  if (branch?.allowSellWithoutStock) {
    return;
  }

  const requiredByItemAndArea = new Map<string, { itemId: number; areaId: number; qty: number; description: string }>();
  const orderItemsInput = orderData?.items ?? [];

  for (const oi of orderItemsInput) {
    if (!oi?.productId) continue;

    // 2. Si el producto permite venta sin stock, omitir la validación de sus insumos
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, oi.productId))
      .limit(1);

    if (product?.allowSellWithoutStock) {
      continue;
    }

    // Obtener el área de producción para esta sucursal y producto
    let [bra] = await db
      .select()
      .from(branchRecipeAreas)
      .where(
        and(
          eq(branchRecipeAreas.productId, oi.productId),
          eq(branchRecipeAreas.branchId, branchId)
        )
      )
      .limit(1);

    // Fallback: si esta sucursal no tiene área configurada, usar configuración de sucursal 1
    if (!bra?.areaId && branchId !== 1) {
      const [fallback] = await db
        .select()
        .from(branchRecipeAreas)
        .where(
          and(
            eq(branchRecipeAreas.productId, oi.productId),
            eq(branchRecipeAreas.branchId, 1)
          )
        )
        .limit(1);
      if (fallback?.areaId) bra = fallback;
    }

    const targetAreaId = bra?.areaId;
    if (!targetAreaId) {
      // Si no hay área configurada, no sabemos de dónde descontar.
      // Omitimos validación de stock para evitar bloqueos del flujo de venta.
      continue;
    }

    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.productId, oi.productId), eq(recipes.isActive, true)))
      .limit(1);

    if (recipe) {
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

        const key = `${rl.itemId}-${targetAreaId}`;
        const existing = requiredByItemAndArea.get(key);
        if (existing) {
          existing.qty += ingredientQty;
        } else {
          requiredByItemAndArea.set(key, {
            itemId: rl.itemId,
            areaId: targetAreaId,
            qty: ingredientQty,
            description: item.shortDescription,
          });
        }
      }
    }

    // Procesar requerimientos de extras para este producto (también se descuentan de targetAreaId)
    if (oi.extras?.length) {
      const extraIds = oi.extras.map((e: any) => e.extraId);
      const extrasData = await db
        .select()
        .from(productExtras)
        .where(inArray(productExtras.id, extraIds));

      for (const sel of oi.extras) {
        const extra = extrasData.find((e) => e.id === sel.extraId);
        if (!extra) continue;

        if (extra.sourceType === 'item' && extra.itemId) {
          const [directItem] = await db.select().from(items).where(eq(items.id, extra.itemId));
          if (!directItem) continue;

          const totalQty = roundQty(sel.qty * toNum(extra.itemQty));
          const key = `${extra.itemId}-${targetAreaId}`;
          const existing = requiredByItemAndArea.get(key);
          if (existing) {
            existing.qty += totalQty;
          } else {
            requiredByItemAndArea.set(key, {
              itemId: extra.itemId,
              areaId: targetAreaId,
              qty: totalQty,
              description: directItem.shortDescription,
            });
          }
        } else if (extra.sourceType === 'recipe' && extra.recipeId) {
          const lines = await db
            .select()
            .from(recipeLines)
            .where(eq(recipeLines.recipeId, extra.recipeId));

          for (const rl of lines) {
            if (rl.isOptional) continue;
            const [item] = await db.select().from(items).where(eq(items.id, rl.itemId));
            if (!item?.recipeDischarge) continue;
            let qty = toNum(rl.qty) * sel.qty;
            if (rl.isCost && toNum(item.conversionFactor) > 0) {
              qty = qty / toNum(item.conversionFactor);
            }

            const key = `${rl.itemId}-${targetAreaId}`;
            const existing = requiredByItemAndArea.get(key);
            if (existing) {
              existing.qty += qty;
            } else {
              requiredByItemAndArea.set(key, {
                itemId: rl.itemId,
                areaId: targetAreaId,
                qty,
                description: item.shortDescription,
              });
            }
          }
        }
      }
    }
  }

  if (requiredByItemAndArea.size === 0) return;

  const missing: string[] = [];
  for (const [, req] of requiredByItemAndArea) {
    const [snap] = await db
      .select()
      .from(stockSnapshot)
      .where(and(eq(stockSnapshot.itemId, req.itemId), eq(stockSnapshot.areaId, req.areaId)));

    const [area] = await db.select().from(storageAreas).where(eq(storageAreas.id, req.areaId));
    const areaName = area?.name ?? `Área #${req.areaId}`;

    const current = snap ? toNum(snap.currentStock) : 0;
    if (req.qty > current) {
      missing.push(
        `${req.description} en [${areaName}]: requerido ${req.qty.toFixed(3)}, disponible ${current.toFixed(3)}`
      );
    }
  }

  if (missing.length > 0) {
    throw new Error(`Stock insuficiente para procesar el pedido. Detalles: ${missing.join(' | ')}`);
  }
};

/**
 * Descarga de stock inmediata al crear un pedido.
 * Los errores de stock no bloquean al mozo, pero se devuelven como advertencias.
 */
export const triggerStockDischargeForOrder = async (orderId: string): Promise<string[]> => {
  try {
    const { autoDischargeOnOrderCreated } = await import('../admin/warehouse/sales-discharge.service');
    const result = await autoDischargeOnOrderCreated(orderId);
    const warnings: string[] = [];
    if (result.skipped.length > 0) {
      for (const s of result.skipped) {
        warnings.push(`${s.productName}: ${s.reason}`);
      }
    }
    return warnings;
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

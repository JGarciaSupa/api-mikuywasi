import { brands, banners, socialLinks, categories, products, tables, paymentMethods, orders, orderItems, orderItemExtras, productExtras, recipes, recipeLines, items, branches, branchRecipeAreas, stockSnapshot, storageAreas, productSalesChannelPrices, salesChannels } from '../../../../db/tenant/schema';
import { eq, and, or, isNull, inArray, isNotNull, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getImageUrl } from '../../../../utils/r2';
import { getTenantDb } from '../../../../utils/tenant-context';
import { findPaymentMethodByName } from '../admin/config-local/payment-method.service';
import { assertStockAvailable, adjustProductStock } from '../shared/product-stock.service';
import {
  type TaxConfig,
  normalizeTaxConfigList,
  resolveEffectiveTaxes,
  resolveLineTaxes,
} from '../shared/taxes.service';
import { getCachedTableStatusesMap } from '@/core/master/services/table-statuses.service';


function toNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const roundMoney = (val: number) => Number(val.toFixed(2));
const roundQty = (val: number) => Number(val.toFixed(3));

// Costo unitario de receta por producto: suma(qty insumo × precio promedio) ÷ porciones
// de la receta de venta activa. Se congela en order_items.unit_cost al crear el pedido,
// porque items.avgPrice cambia con cada compra y el costo histórico se perdería.
export async function resolveRecipeUnitCosts(db: any, productIds: number[]) {
  const costByProduct = new Map<number, number>();
  if (productIds.length === 0) return costByProduct;

  const rows = await db
    .select({
      productId: recipes.productId,
      recipeId: recipes.id,
      servings: recipes.servings,
      lineQty: recipeLines.qty,
      itemAvgPrice: items.avgPrice,
    })
    .from(recipes)
    .innerJoin(recipeLines, eq(recipeLines.recipeId, recipes.id))
    .innerJoin(items, eq(recipeLines.itemId, items.id))
    .where(and(
      inArray(recipes.productId, productIds),
      eq(recipes.type, 'sales'),
      eq(recipes.isActive, true),
    ));

  const chosenRecipe = new Map<number, number>();
  const acc = new Map<number, { cost: number; servings: number }>();
  for (const row of rows) {
    const productId = Number(row.productId);
    // Si un producto tuviera más de una receta activa, usar solo la primera
    const chosen = chosenRecipe.get(productId) ?? row.recipeId;
    if (chosen !== row.recipeId) continue;
    chosenRecipe.set(productId, chosen);

    const entry = acc.get(productId) ?? { cost: 0, servings: toNum(row.servings) || 1 };
    entry.cost += toNum(row.lineQty) * toNum(row.itemAvgPrice);
    acc.set(productId, entry);
  }

  for (const [productId, { cost, servings }] of acc) {
    costByProduct.set(productId, cost / servings);
  }
  return costByProduct;
}

async function resolveBranchDefaultChannelId(db: ReturnType<typeof getTenantDb>, branchId: number) {
  const [activeChannel] = await db
    .select({ id: salesChannels.id })
    .from(salesChannels)
    .where(and(
      or(eq(salesChannels.branchId, branchId), isNull(salesChannels.branchId)),
      eq(salesChannels.isActive, true),
    ))
    .orderBy(salesChannels.name)
    .limit(1);

  return activeChannel?.id ?? null;
}

async function attachProductChannelPrices(db: ReturnType<typeof getTenantDb>, rows: any[]) {
  if (rows.length === 0) return rows;

  const productIds = rows.map((row) => row.id);
  const priceRows = await db
    .select()
    .from(productSalesChannelPrices)
    .where(inArray(productSalesChannelPrices.productId, productIds));

  const byProductId = new Map<number, any[]>();
  for (const priceRow of priceRows) {
    const list = byProductId.get(priceRow.productId) ?? [];
    list.push(priceRow);
    byProductId.set(priceRow.productId, list);
  }

  return rows.map((row) => ({
    ...row,
    image: getImageUrl(row.image),
    channelPrices: byProductId.get(row.id) ?? [],
  }));
}

/**
 * Obtener información pública del tenant (config, banners, social links)
 * Banners/social links con branchId=null son globales; si se indica branchId,
 * se incluyen además los propios de esa sede.
 */
export const getTenantInfo = async (branchId?: number) => {
  const db = getTenantDb();

  const [config] = await db.select().from(brands).limit(1);

  const bannerCondition = branchId
    ? or(isNull(banners.branchId), eq(banners.branchId, branchId))
    : isNull(banners.branchId);
  const socialCondition = branchId
    ? or(isNull(socialLinks.branchId), eq(socialLinks.branchId, branchId))
    : isNull(socialLinks.branchId);

  const tenantBanners = await db.select().from(banners)
    .where(bannerCondition)
    .orderBy(banners.order);

  const tenantSocialLinks = await db.select().from(socialLinks)
    .where(and(socialCondition, eq(socialLinks.isActive, true)))
    .orderBy(socialLinks.order);

  return {
    ...config,
    logo: getImageUrl(config?.logo ?? null),
    banners: tenantBanners.map((b: any) => ({ ...b, url: getImageUrl(b.url) })),
    socialLinks: tenantSocialLinks,
  };
};

/**
 * Obtener sucursales activas del tenant (campo público, sin datos fiscales/internos).
 */
export const getBranches = async () => {
  const db = getTenantDb();

  const rows = await db.select({
    id: branches.id,
    name: branches.name,
    code: branches.code,
    isMain: branches.isMain,
    address: branches.address,
    deliveryZone: branches.deliveryZone,
    schedules: branches.schedules,
    phone: branches.phone,
    whatsapp: branches.whatsapp,
    email: branches.email,
    hasDelivery: branches.hasDelivery,
    hasPickup: branches.hasPickup,
    hasDineIn: branches.hasDineIn,
    hasLiveTracking: branches.hasLiveTracking,
    minOrderAmount: branches.minOrderAmount,
    defaultDeliveryFee: branches.defaultDeliveryFee,
    freeDeliveryThreshold: branches.freeDeliveryThreshold,
  })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(branches.name);

  return rows;
};

/**
 * Resuelve el branchId a usar para un pedido público: el enviado por el cliente
 * (si existe y está activo), o si no, la sede principal activa (isMain), o si no,
 * la primera sede activa. Lanza si el tenant no tiene ninguna sede activa.
 */
async function resolveOrderBranchId(db: ReturnType<typeof getTenantDb>, requestedBranchId?: number | null) {
  if (requestedBranchId) {
    const [branch] = await db.select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.id, requestedBranchId), eq(branches.isActive, true)))
      .limit(1);
    if (branch) return branch.id;
  }

  const [mainBranch] = await db.select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.isMain, true), eq(branches.isActive, true)))
    .limit(1);
  if (mainBranch) return mainBranch.id;

  const [anyBranch] = await db.select({ id: branches.id })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(branches.id)
    .limit(1);
  if (anyBranch) return anyBranch.id;

  throw new Error('El tenant no tiene ninguna sucursal activa configurada.');
}

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

  const allMenuProducts = [
    ...categoriesWithProducts.flatMap((cat) => cat.products),
    ...productsWithoutCategory,
  ];
  const productsWithPrices = await attachProductChannelPrices(db, allMenuProducts);
  const productMap = new Map<number, any>(productsWithPrices.map((product) => [product.id, product]));

  const result: any[] = categoriesWithProducts
    .map((cat) => ({
      ...cat,
      products: cat.products.map((product) => productMap.get(product.id) ?? { ...product, image: getImageUrl(product.image), channelPrices: [] }),
    }))
    .filter((cat) => cat.products.length > 0);

  const productsWithoutCategoryWithPrices = productsWithoutCategory
    .map((product) => productMap.get(product.id) ?? { ...product, image: getImageUrl(product.image), channelPrices: [] });

  if (productsWithoutCategoryWithPrices.length > 0) {
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
      products: productsWithoutCategoryWithPrices
    });
  }

  return result;
};

/**
 * Obtener mesas del restaurante. Si se indica branchId, solo las de esa sede.
 */
export const getTables = async (branchId?: number) => {
  const db = getTenantDb();
  if (branchId) {
    return await db.select().from(tables).where(eq(tables.branchId, branchId)).orderBy(tables.name);
  }
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
      orderFor: orders.orderFor,
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

  const statusesMap = await getCachedTableStatusesMap();
  const defaultStatus = statusesMap.get('available') || {
    code: 'available',
    name: 'Disponible',
    colorHex: '#10B981',
    bgColorClass: 'bg-emerald-500',
    isOperational: true
  };

  return allTables.map((table) => {
    const activeOrder = activeByTableId.get(table.id) ?? null;
    const s = statusesMap.get(table.statusCode) || defaultStatus;
    return {
      ...table,
      status: {
        code: s.code,
        name: s.name,
        colorHex: s.colorHex,
        bgColorClass: s.bgColorClass,
        isOperational: s.isOperational,
        updatedAt: table.statusUpdatedAt
      },
      activeOrder: activeOrder
        ? {
          id: activeOrder.id,
          trackingCode: activeOrder.trackingCode,
          customerName: activeOrder.customerName,
          orderFor: activeOrder.orderFor,
          status: activeOrder.status,
          total: activeOrder.total,
          createdAt: activeOrder.createdAt,
        }
        : null,
    };
  });
};


/**
 * Obtener métodos de pago activos. branchId=null en el registro significa
 * "disponible en todas las sedes"; si se indica branchId, se incluyen esos + los globales.
 */
export const getPaymentMethods = async (branchId?: number) => {
  const db = getTenantDb();
  const branchCondition = branchId
    ? or(isNull(paymentMethods.branchId), eq(paymentMethods.branchId, branchId))
    : isNull(paymentMethods.branchId);

  return await db.select().from(paymentMethods)
    .where(and(eq(paymentMethods.isActive, true), branchCondition))
    .orderBy(paymentMethods.name);
};

/**
 * Genera el trackingCode secuencial por año: 20260001, 20260002...
 * Al superar 9999 la secuencia crece un dígito de forma natural (202610000).
 * El sufijo se compara como número (no como texto) para que 10000 > 9999.
 */
const generateTrackingCode = async (tx: any): Promise<string> => {
  const year = String(new Date().getFullYear());
  const [row] = await tx
    .select({
      maxSeq: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${orders.trackingCode} FROM 5) AS INTEGER)), 0)`,
    })
    .from(orders)
    .where(sql`${orders.trackingCode} ~ ${`^${year}[0-9]+$`}`);

  const nextSeq = Number(row?.maxSeq ?? 0) + 1;
  return `${year}${String(nextSeq).padStart(4, '0')}`;
};

/**
 * Crear un nuevo pedido (con NanoID y reintentos en colisión)
 */
export const createOrder = async (orderData: any, initialStatus: 'pending' | 'confirmed' | 'preparing' | 'dispatched' | 'ready_for_pickup' | 'completed' | 'cancelled' = 'pending') => {
  const db = getTenantDb();
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const branchId = await resolveOrderBranchId(db, orderData.branchId);
  const deliveryFee = roundMoney(toNum(orderData.deliveryFee));
  const retentionPercentage = roundMoney(toNum(orderData.retentionPercentage));

  // Método de pago: en interno (POS) no se envía → null (se elige al cobrar).
  // En web el cliente sí envía su método previsto → se guarda + resuelve su id (relación estable).
  const pm = orderData.paymentMethod ? await findPaymentMethodByName(orderData.paymentMethod) : null;

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const orderId = nanoid(12);

      return await db.transaction(async (tx) => {
        // Dentro de la transacción: si dos pedidos concurrentes calculan el mismo
        // número, el índice único dispara 23505 y el while reintenta con el siguiente.
        const trackingCode = await generateTrackingCode(tx);
        const [branch] = await tx.select().from(branches).where(eq(branches.id, branchId)).limit(1);
        const branchTaxConfigs = normalizeTaxConfigList((branch as any)?.taxes ?? undefined);

        const resolvedSalesChannelId = orderData.salesChannelId ?? await resolveBranchDefaultChannelId(tx, branchId);
        const [salesChannelRow] = resolvedSalesChannelId
          ? await tx.select().from(salesChannels).where(eq(salesChannels.id, resolvedSalesChannelId)).limit(1)
          : [null];

        // Reglas operativas del canal de venta (mozo/mesa/pax/cliente/entrega): no
        // dependen solo de la validación de forma de zod, sino del estado real del
        // canal en base de datos — por eso se validan acá, no en order.validation.ts.
        if (salesChannelRow) {
          if (salesChannelRow.requireTable && !orderData.tableId) {
            throw new Error('Este canal de venta exige seleccionar una mesa');
          }
          if (salesChannelRow.requireWaiter && !orderData.waiterId) {
            throw new Error('Este canal de venta exige asignar un mozo');
          }
          if (salesChannelRow.requirePax && !orderData.paxAdults && !orderData.paxChildren) {
            throw new Error('Este canal de venta exige indicar el número de comensales');
          }
          if (salesChannelRow.requireCustomer && !orderData.customerId) {
            throw new Error('Este canal de venta exige un cliente frecuente');
          }
          if (salesChannelRow.requireDeliveryAddress && !orderData.orderFor?.trim()) {
            throw new Error('Este canal de venta exige indicar a quién se entrega el pedido');
          }
        }

        // Aforo: la suma de pax adultos + niños no puede superar la capacidad de la mesa.
        if (orderData.tableId) {
          const totalPax = Number(orderData.paxAdults ?? 0) + Number(orderData.paxChildren ?? 0);
          if (totalPax > 0) {
            const [tableRow] = await tx.select().from(tables).where(eq(tables.id, orderData.tableId)).limit(1);
            if (tableRow && totalPax > (tableRow.capacity ?? Infinity)) {
              throw new Error(`El número de comensales (${totalPax}) supera la capacidad de la mesa (${tableRow.capacity})`);
            }
          }
        }

        const productIds = Array.from(new Set(
          items
            .map((item: any) => Number(item.productId))
            .filter((id: number) => Number.isFinite(id) && id > 0)
        )) as number[];

        const extraIds = Array.from(new Set(
          items.flatMap((item: any) => (item.extras ?? []).map((extra: any) => Number(extra.extraId)))
            .filter((id: number) => Number.isFinite(id) && id > 0)
        )) as number[];

        const [productRows, channelPriceRows, extraRows, recipeUnitCosts] = await Promise.all([
          productIds.length
            // FOR UPDATE bloquea las filas de producto durante la transacción para que dos
            // pedidos concurrentes no puedan sobrevender el mismo stock manual.
            ? tx.select().from(products).where(inArray(products.id, productIds)).for('update')
            : Promise.resolve([] as any[]),
          resolvedSalesChannelId && productIds.length
            ? tx.select().from(productSalesChannelPrices).where(
              and(
                eq(productSalesChannelPrices.salesChannelId, resolvedSalesChannelId),
                inArray(productSalesChannelPrices.productId, productIds),
              )
            )
            : Promise.resolve([] as any[]),
          extraIds.length
            ? tx.select().from(productExtras).where(inArray(productExtras.id, extraIds))
            : Promise.resolve([] as any[]),
          resolveRecipeUnitCosts(tx, productIds),
        ]);

        const productMap = new Map<number, any>(productRows.map((product) => [product.id, product]));
        const channelPriceMap = new Map<number, any>(channelPriceRows.map((row) => [row.productId, row]));
        const extraMap = new Map<number, any>(extraRows.map((extra) => [extra.id, extra]));

        const computedItems: Array<any> = [];
        const orderTaxMap = new Map<string, {
          key: string;
          label: string;
          rate: number;
          isActive: boolean;
          defaultActive?: boolean;
          calculationType?: 'percentage' | 'fixed';
          amount: number;
        }>();

        let grossSubtotal = 0;

        for (const rawItem of items) {
          const productId = Number(rawItem.productId);
          const product = productMap.get(productId);
          if (!product) {
            throw new Error(`Producto no encontrado para el pedido: ${productId}`);
          }

          const channelPrice = channelPriceMap.get(productId);
          const resolvedUnitPrice = toNum(
            channelPrice?.isActive
              ? (channelPrice.discountPrice ?? channelPrice.price)
              : (product.discountPrice ?? product.price)
          );
          const packagingFee = toNum(channelPrice?.isActive ? (product.packagingFee ?? 0) : (product.packagingFee ?? 0));
          const quantity = Math.max(1, Math.round(toNum(rawItem.quantity)));
          const selectedAlternatives = Array.isArray(rawItem.selectedAlternatives) ? rawItem.selectedAlternatives : [];
          const alternativesExtra = selectedAlternatives.reduce(
            (sum: number, alt: any) => sum + (toNum(alt?.extraPrice) * quantity),
            0
          );

          const selectedExtras = Array.isArray(rawItem.extras) ? rawItem.extras : [];
          const extrasTotal = selectedExtras.reduce((sum: number, sel: any) => {
            const extra = extraMap.get(Number(sel.extraId));
            if (!extra) return sum;
            const qty = Math.max(1, Math.round(toNum(sel.qty)));
            return sum + (toNum(extra.price) * qty);
          }, 0);

          const grossLine = roundMoney(
            (resolvedUnitPrice * quantity) +
            alternativesExtra +
            extrasTotal +
            (packagingFee * quantity)
          );

          // El override por producto/canal solo activa o desactiva impuestos; la tasa
          // vigente sale siempre de la sucursal (ver resolveEffectiveTaxes).
          const sourceTaxes = resolveEffectiveTaxes(
            branchTaxConfigs,
            (channelPrice?.taxes ?? null) as TaxConfig[] | null,
          );
          const lineTax = resolveLineTaxes(grossLine, quantity, sourceTaxes);

          grossSubtotal = roundMoney(grossSubtotal + lineTax.lineTotal);

          for (const tax of lineTax.taxSnapshot) {
            const current = orderTaxMap.get(tax.key) ?? {
              key: tax.key,
              label: tax.label,
              rate: tax.rate,
              isActive: tax.isActive,
              defaultActive: tax.defaultActive,
              calculationType: tax.calculationType,
              amount: 0,
            };
            current.amount = roundMoney(current.amount + toNum(tax.amount));
            orderTaxMap.set(tax.key, current);
          }

          const recipeUnitCost = recipeUnitCosts.get(product.id);

          computedItems.push({
            productId: product.id,
            productName: product.name,
            salesChannelId: resolvedSalesChannelId,
            unitPrice: resolvedUnitPrice.toFixed(2),
            unitCost: recipeUnitCost !== undefined ? recipeUnitCost.toFixed(4) : null,
            quantity,
            selectedAlternatives,
            packagingFee: packagingFee.toFixed(2),
            notes: rawItem.notes ?? null,
            totalPrice: lineTax.lineTotal.toFixed(2),
            taxSnapshot: lineTax.taxSnapshot,
            extras: selectedExtras.map((sel: any) => {
              const extra = extraMap.get(Number(sel.extraId));
              if (!extra) return null;
              const qty = Math.max(1, Math.round(toNum(sel.qty)));
              return {
                extraId: Number(sel.extraId),
                qty,
                unitPrice: toNum(extra.price).toFixed(2),
                totalPrice: roundMoney(toNum(extra.price) * qty).toFixed(2),
              };
            }).filter(Boolean),
          });
        }

        // Stock manual por producto (independiente del almacén de insumos): si el producto tiene
        // un tope configurado, no se puede vender más de lo disponible.
        const requestedQtyByProductId = new Map<number, number>();
        for (const item of computedItems) {
          requestedQtyByProductId.set(
            item.productId,
            (requestedQtyByProductId.get(item.productId) ?? 0) + item.quantity
          );
        }
        for (const [productId, requestedQty] of requestedQtyByProductId) {
          const product = productMap.get(productId);
          if (product) assertStockAvailable(product, requestedQty);
        }

        const taxBreakdown = Array.from(orderTaxMap.values()).sort((a, b) => a.label.localeCompare(b.label));
        const subtotal = grossSubtotal;
        const retentionAmount = roundMoney(
          orderData.retentionAmount !== undefined
            ? toNum(orderData.retentionAmount)
            : ((subtotal + deliveryFee) * retentionPercentage) / 100
        );
        const total = roundMoney(subtotal + deliveryFee + retentionAmount);

        const [result] = await tx.insert(orders).values({
          id: orderId,
          branchId,
          customerId: orderData.customerId ?? null,
          customerName: orderData.customerName,
          customerPhone: orderData.customerPhone,
          customerAddress: orderData.customerAddress,
          orderFor: orderData.orderFor ?? null,
          deliveryType: orderData.deliveryType,
          deliveryInfo: orderData.deliveryInfo,
          salesChannelId: resolvedSalesChannelId ?? null,
          salesChannelName: salesChannelRow?.name ?? null,
          tableId: orderData.tableId,
          tableName: orderData.tableName,
          waiterId: orderData.waiterId ?? null,
          paxAdults: orderData.paxAdults ?? null,
          paxChildren: orderData.paxChildren ?? null,
          paymentMethod: orderData.paymentMethod ?? null,
          paymentMethodId: pm?.id ?? null,
          notes: orderData.notes,
          cashSessionId: orderData.cashSessionId ?? null,
          subtotal: subtotal.toFixed(2),
          deliveryFee: deliveryFee.toFixed(2),
          retentionPercentage: retentionPercentage.toFixed(2),
          retentionAmount: retentionAmount.toFixed(2),
          total: total.toFixed(2),
          taxBreakdown,
          trackingCode,
          status: initialStatus,
          paymentStatus: 'unpaid',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        if (computedItems.length > 0) {
          const insertedItems = await tx.insert(orderItems).values(
            computedItems.map((item) => ({
              orderId,
              productId: item.productId,
              salesChannelId: item.salesChannelId,
              productName: item.productName,
              unitPrice: item.unitPrice,
              unitCost: item.unitCost,
              quantity: item.quantity,
              selectedAlternatives: item.selectedAlternatives || [],
              packagingFee: item.packagingFee,
              notes: item.notes,
              totalPrice: item.totalPrice,
              taxSnapshot: item.taxSnapshot,
            }))
          ).returning();

          for (let i = 0; i < insertedItems.length; i++) {
            const orderItem = insertedItems[i];
            const srcItem = computedItems[i];
            if (!srcItem.extras?.length) continue;

            const extraRowsData = srcItem.extras.map((extra: any) => ({
              orderItemId: orderItem.id,
              extraId: extra.extraId,
              qty: extra.qty,
              unitPrice: extra.unitPrice,
              totalPrice: extra.totalPrice,
            }));

            if (extraRowsData.length) {
              await tx.insert(orderItemExtras).values(extraRowsData);
            }
          }
        }

        for (const [productId, requestedQty] of requestedQtyByProductId) {
          await adjustProductStock(tx, productId, -requestedQty);
        }

        if (orderData.tableId) {
          await tx.update(tables).set({
            statusCode: 'in_kitchen',
            statusUpdatedAt: new Date(),
            updatedAt: new Date()
          }).where(eq(tables.id, orderData.tableId));
        }

        return { ...result, items: computedItems, taxBreakdown };
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
  const branchId = await resolveOrderBranchId(db, orderData.branchId);

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

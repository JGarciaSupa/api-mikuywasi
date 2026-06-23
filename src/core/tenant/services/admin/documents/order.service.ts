import { orders, orderItems, orderItemExtras, productExtras } from '../../../../../db/tenant/schema';
import { eq, and, desc, asc, sql, count, like, or, gte, lte, inArray } from 'drizzle-orm';
import { getTenantDb, getTenantContext } from '../../../../../utils/tenant-context';

const toNum = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value: number) => Number(value.toFixed(2));

export interface GetOrdersFilters {
  page?: number;
  limit?: number;
  status?: string;
  paymentStatus?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  branchId?: number;
}

/**
 * Obtener listado de órdenes paginado y filtrado
 */
export const getOrders = async (filters: GetOrdersFilters) => {
  const db = getTenantDb();
  const {
    page = 1,
    limit = 10,
    status,
    paymentStatus,
    search,
    startDate,
    endDate,
    branchId
  } = filters;

  const offset = (page - 1) * limit;

  // Construir condiciones
  const conditions = [];

  if (branchId) {
    conditions.push(eq(orders.branchId, branchId));
  }

  if (status) {
    conditions.push(eq(orders.status, status as any));
  }

  if (paymentStatus) {
    conditions.push(eq(orders.paymentStatus, paymentStatus as any));
  }

  if (startDate) {
    conditions.push(gte(orders.createdAt, new Date(startDate)));
  }

  if (endDate) {
    // Al final del día para incluir las de esa fecha
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(orders.createdAt, end));
  }

  if (search) {
    conditions.push(
      or(
        like(orders.customerName, `%${search}%`),
        like(orders.customerPhone, `%${search}%`),
        like(orders.trackingCode, `%${search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const baseQuery = db.select().from(orders);
  const countQuery = db.select({ total: count() }).from(orders);

  const data = await (whereClause
    ? baseQuery.where(whereClause)
    : baseQuery)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(orders.createdAt));

  const [totalResult] = await (whereClause
    ? countQuery.where(whereClause)
    : countQuery);

  const total = totalResult?.total || 0;

  return {
    data,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    }
  };
};

/**
 * Obtener detalle de una orden por ID
 */
export const getOrderById = async (id: string) => {
  const db = getTenantDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id)));

  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id));

  const itemIds = items.map((i) => i.id);
  const extrasRows = itemIds.length
    ? await db
        .select({
          id: orderItemExtras.id,
          orderItemId: orderItemExtras.orderItemId,
          extraId: orderItemExtras.extraId,
          extraName: productExtras.name,
          qty: orderItemExtras.qty,
          unitPrice: orderItemExtras.unitPrice,
          totalPrice: orderItemExtras.totalPrice,
        })
        .from(orderItemExtras)
        .leftJoin(productExtras, eq(orderItemExtras.extraId, productExtras.id))
        .where(inArray(orderItemExtras.orderItemId, itemIds))
    : [];

  const extrasByItem = new Map<number, typeof extrasRows>();
  for (const row of extrasRows) {
    const list = extrasByItem.get(row.orderItemId) ?? [];
    list.push(row);
    extrasByItem.set(row.orderItemId, list);
  }

  return {
    ...order,
    items: items.map((item) => ({ ...item, extras: extrasByItem.get(item.id) ?? [] })),
  };
};

/**
 * Actualizar estado de la orden
 */
export const updateOrderStatus = async (id: string, status: string) => {
  const db = getTenantDb();

  // If order status is updated to 'cancelled', revert the stock discharge
  if (status === 'cancelled') {
    const { reverseDischargeForOrder } = await import('../warehouse/sales-discharge.service');
    await reverseDischargeForOrder(id);
  }

  const [updated] = await db
    .update(orders)
    .set({
      status: status as any,
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, id)))
    .returning();

  return updated;
};

/**
 * Actualizar estado de pago
 */
export const updateOrderPaymentStatus = async (
  id: string,
  paymentStatus: string,
  paymentMethod?: string,
  retentionPercentage?: number,
) => {
  const db = getTenantDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id)));
  if (!order) return null;

  const nextRetentionPercentage = paymentStatus === 'paid'
    ? roundMoney(retentionPercentage ?? toNum(order.retentionPercentage))
    : 0;
  const baseAmount = toNum(order.subtotal) + toNum(order.deliveryFee);
  const retentionAmount = paymentStatus === 'paid'
    ? roundMoney((baseAmount * nextRetentionPercentage) / 100)
    : 0;
  const total = roundMoney(baseAmount + retentionAmount);

  const [updated] = await db
    .update(orders)
    .set({
      paymentStatus: paymentStatus as any,
      ...(paymentMethod !== undefined ? { paymentMethod } : {}),
      retentionPercentage: nextRetentionPercentage.toFixed(2),
      retentionAmount: retentionAmount.toFixed(2),
      total: total.toFixed(2),
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, id)))
    .returning();

  return updated;
};

/**
 * Obtener estadísticas básicas para el dashboard
 */
export const getOrderStats = async (branchId?: number) => {
  const db = getTenantDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const conditions = [gte(orders.createdAt, today)];
  const statusConditions = [];

  if (branchId) {
    conditions.push(eq(orders.branchId, branchId));
    statusConditions.push(eq(orders.branchId, branchId));
  }

  // Ventas de hoy (en total)
  const [todayStats] = await db
    .select({
      count: count(),
      totalSales: sql<number>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`
    })
    .from(orders)
    .where(and(...conditions));

  // Conteos por estado
  const statusStats = await db
    .select({
      status: orders.status,
      count: count()
    })
    .from(orders)
    .where(statusConditions.length > 0 ? and(...statusConditions) : undefined)
    .groupBy(orders.status);

  return {
    todaySales: todayStats?.totalSales || 0,
    todayOrders: todayStats?.count || 0,
    byStatus: statusStats.reduce((acc, curr) => {
      acc[curr.status] = curr.count;
      return acc;
    }, {} as Record<string, number>)
  };
};

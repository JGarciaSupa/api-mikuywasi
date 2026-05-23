import { orders, orderItems } from '../../../../db/tenant/schema';
import { eq, and, desc, asc, sql, count, like, or, gte, lte } from 'drizzle-orm';
import { getTenantDb } from '../../../../utils/tenant-context';

export interface GetOrdersFilters {
  page?: number;
  limit?: number;
  status?: string;
  paymentStatus?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
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
    endDate
  } = filters;

  const offset = (page - 1) * limit;

  // Construir condiciones
  const conditions = [];

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

  return {
    ...order,
    items
  };
};

/**
 * Actualizar estado de la orden
 */
export const updateOrderStatus = async (id: string, status: string) => {
  const db = getTenantDb();
  const [updated] = await db
    .update(orders)
    .set({
      status: status as any,
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, id)))
    .returning();

  if (updated && status === 'completed') {
    try {
      const { autoDischargeOnOrderCompleted } = await import('../warehouse/sales-discharge.service');
      await autoDischargeOnOrderCompleted(id);
    } catch (err) {
      console.warn('[warehouse] Descarga automática omitida:', err instanceof Error ? err.message : err);
    }
  }

  return updated;
};

/**
 * Actualizar estado de pago
 */
export const updateOrderPaymentStatus = async (id: string, paymentStatus: string) => {
  const db = getTenantDb();
  const [updated] = await db
    .update(orders)
    .set({
      paymentStatus: paymentStatus as any,
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, id)))
    .returning();

  return updated;
};

/**
 * Obtener estadísticas básicas para el dashboard
 */
export const getOrderStats = async () => {
  const db = getTenantDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Ventas de hoy (en total)
  const [todayStats] = await db
    .select({
      count: count(),
      totalSales: sql<number>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, today)
      )
    );

  // Conteos por estado
  const statusStats = await db
    .select({
      status: orders.status,
      count: count()
    })
    .from(orders)
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

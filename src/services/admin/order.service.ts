import { db } from '../../db';
import { orders, orderItems } from '../../db/schema';
import { eq, and, desc, asc, sql, count, like, or, gte, lte } from 'drizzle-orm';

export interface GetOrdersFilters {
  tenantId: number;
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
  const { 
    tenantId, 
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
  const conditions = [eq(orders.tenantId, tenantId)];

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

  const whereClause = and(...conditions);
  if (!whereClause) {
    throw new Error('Clause where no pudo ser construida');
  }

  // Consulta paginada
  const data = await db
    .select()
    .from(orders)
    .where(whereClause!)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(orders.createdAt));

  // Contar total
  const [totalResult] = await db
    .select({ total: count() })
    .from(orders)
    .where(whereClause!);

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
export const getOrderById = async (id: string, tenantId: number) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));

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
export const updateOrderStatus = async (id: string, tenantId: number, status: string) => {
  const [updated] = await db
    .update(orders)
    .set({ 
      status: status as any,
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .returning();

  return updated;
};

/**
 * Actualizar estado de pago
 */
export const updateOrderPaymentStatus = async (id: string, tenantId: number, paymentStatus: string) => {
  const [updated] = await db
    .update(orders)
    .set({ 
      paymentStatus: paymentStatus as any,
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .returning();

  return updated;
};

/**
 * Obtener estadísticas básicas para el dashboard
 */
export const getOrderStats = async (tenantId: number) => {
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
        eq(orders.tenantId, tenantId),
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
    .where(eq(orders.tenantId, tenantId))
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

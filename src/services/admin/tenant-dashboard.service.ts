import { db } from '../../db';
import { orders } from '../../db/schema';
import { eq, sql, and, gte, lt, inArray, ne } from 'drizzle-orm';

export const getTenantDashboardStats = async (tenantId: number) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayEnd = todayStart;

  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  
  const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // 1. Daily Sales
  const [dailySalesResult] = await db.select({ 
    total: sql<number>`sum(CAST(${orders.total} AS DECIMAL))` 
  }).from(orders).where(
    and(
      eq(orders.tenantId, tenantId),
      gte(orders.createdAt, todayStart),
      lt(orders.createdAt, todayEnd),
      ne(orders.status, 'cancelled')
    )
  );
  const dailySales = Number(dailySalesResult?.total || 0);

  // 2. Yesterday Sales (for growth)
  const [yesterdaySalesResult] = await db.select({ 
    total: sql<number>`sum(CAST(${orders.total} AS DECIMAL))` 
  }).from(orders).where(
    and(
      eq(orders.tenantId, tenantId),
      gte(orders.createdAt, yesterdayStart),
      lt(orders.createdAt, yesterdayEnd),
      ne(orders.status, 'cancelled')
    )
  );
  const yesterdaySales = Number(yesterdaySalesResult?.total || 0);
  const dailyGrowth = yesterdaySales === 0 ? (dailySales > 0 ? 100 : 0) : ((dailySales - yesterdaySales) / yesterdaySales) * 100;

  // 3. New Orders (Pending + Confirmed today)
  const [newOrdersResult] = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(orders).where(
    and(
      eq(orders.tenantId, tenantId),
      gte(orders.createdAt, todayStart),
      lt(orders.createdAt, todayEnd),
      inArray(orders.status, ['pending', 'confirmed'])
    )
  );
  const newOrders = Number(newOrdersResult?.count || 0);

  // 4. Pending Preparation
  const [pendingPrepResult] = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(orders).where(
    and(
      eq(orders.tenantId, tenantId),
      eq(orders.status, 'confirmed')
    )
  );
  const pendingPrep = Number(pendingPrepResult?.count || 0);

  // 5. Total Revenue (This month)
  const [totalRevenueResult] = await db.select({ 
    total: sql<number>`sum(CAST(${orders.total} AS DECIMAL))` 
  }).from(orders).where(
    and(
      eq(orders.tenantId, tenantId),
      gte(orders.createdAt, firstDayOfMonth),
      lt(orders.createdAt, firstDayOfNextMonth),
      ne(orders.status, 'cancelled')
    )
  );
  const totalRevenue = Number(totalRevenueResult?.total || 0);

  // 6. Last Month Revenue (for growth)
  const [lastMonthRevenueResult] = await db.select({ 
    total: sql<number>`sum(CAST(${orders.total} AS DECIMAL))` 
  }).from(orders).where(
    and(
      eq(orders.tenantId, tenantId),
      gte(orders.createdAt, firstDayOfLastMonth),
      lt(orders.createdAt, firstDayOfMonth),
      ne(orders.status, 'cancelled')
    )
  );
  const lastMonthRevenue = Number(lastMonthRevenueResult?.total || 0);
  const revenueGrowth = lastMonthRevenue === 0 ? (totalRevenue > 0 ? 100 : 0) : ((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;

  // 7. Recent Orders (Last 5)
  const recentOrders = await db.query.orders.findMany({
    where: eq(orders.tenantId, tenantId),
    limit: 5,
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
  });

  return {
    dailySales: {
      value: dailySales,
      growth: dailyGrowth
    },
    newOrders: {
      value: newOrders,
      pendingPreparation: pendingPrep
    },
    totalRevenue: {
      value: totalRevenue,
      growth: revenueGrowth
    },
    recentOrders
  };
};

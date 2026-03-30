import { db } from '../../db';
import { tenants, subscriptions, orders, users } from '../../db/schema';
import { eq, sql, and, gte, lt } from 'drizzle-orm';

export const getDashboardStats = async () => {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  
  const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // 1. Total Income (All time platform revenue from subscriptions)
  const [totalIncomeResult] = await db.select({ 
    total: sql<number>`sum(CAST(${subscriptions.pricePaid} AS DECIMAL))` 
  }).from(subscriptions).where(eq(subscriptions.paymentStatus, 'paid'));
  
  const totalIncome = Number(totalIncomeResult?.total || 0);

  // 2. Income This Month
  const [incomeThisMonthResult] = await db.select({ 
    total: sql<number>`sum(CAST(${subscriptions.pricePaid} AS DECIMAL))` 
  }).from(subscriptions).where(
    and(
      eq(subscriptions.paymentStatus, 'paid'),
      gte(subscriptions.createdAt, firstDayOfMonth),
      lt(subscriptions.createdAt, firstDayOfNextMonth)
    )
  );
  
  const incomeThisMonth = Number(incomeThisMonthResult?.total || 0);

  // 3. Income Last Month (for growth calculation)
  const [incomeLastMonthResult] = await db.select({ 
    total: sql<number>`sum(CAST(${subscriptions.pricePaid} AS DECIMAL))` 
  }).from(subscriptions).where(
    and(
      eq(subscriptions.paymentStatus, 'paid'),
      gte(subscriptions.createdAt, firstDayOfLastMonth),
      lt(subscriptions.createdAt, firstDayOfMonth)
    )
  );
  
  const incomeLastMonth = Number(incomeLastMonthResult?.total || 0);
  const incomeGrowth = incomeLastMonth === 0 ? 100 : ((incomeThisMonth - incomeLastMonth) / incomeLastMonth) * 100;

  // 4. Total Active Tenants
  const [activeTenantsResult] = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(tenants).where(eq(tenants.status, 'active'));
  
  const activeTenants = Number(activeTenantsResult?.count || 0);

  // 5. New Tenants This Month
  const [newTenantsThisMonthResult] = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(tenants).where(
    and(
      gte(tenants.createdAt, firstDayOfMonth),
      lt(tenants.createdAt, firstDayOfNextMonth)
    )
  );
  
  const newTenantsThisMonth = Number(newTenantsThisMonthResult?.count || 0);

  // 6. Total Orders
  const [totalOrdersResult] = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(orders);
  
  const totalOrders = Number(totalOrdersResult?.count || 0);

  // 7. Orders This Month
  const [ordersThisMonthResult] = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(orders).where(
    and(
      gte(orders.createdAt, firstDayOfMonth),
      lt(orders.createdAt, firstDayOfNextMonth)
    )
  );
  
  const ordersThisMonth = Number(ordersThisMonthResult?.count || 0);

  // 8. Orders Last Month
  const [ordersLastMonthResult] = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(orders).where(
    and(
      gte(orders.createdAt, firstDayOfLastMonth),
      lt(orders.createdAt, firstDayOfMonth)
    )
  );
  
  const ordersLastMonth = Number(ordersLastMonthResult?.count || 0);
  const ordersGrowth = ordersLastMonth === 0 ? 100 : ((ordersThisMonth - ordersLastMonth) / ordersLastMonth) * 100;

  // 9. Total Users (Admins)
  const [totalUsersResult] = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(users).where(eq(users.role, 'admin'));
  
  const totalUsers = Number(totalUsersResult?.count || 0);

  // 10. New Users This Month (Admins)
  const [newUsersThisMonthResult] = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(users).where(
    and(
      eq(users.role, 'admin'),
      gte(users.createdAt, firstDayOfMonth),
      lt(users.createdAt, firstDayOfNextMonth)
    )
  );
  
  const newUsersThisMonth = Number(newUsersThisMonthResult?.count || 0);

  // 11. Recent Tenants (Last 5)
  const recentTenants = await db.query.tenants.findMany({
    limit: 5,
    orderBy: (tenants, { desc }) => [desc(tenants.createdAt)],
    with: {
      plan: true
    }
  });

  // 12. Expiring Subscriptions (Next 7 days)
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const expiringSubscriptions = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, 'active'),
      gte(subscriptions.endDate, now),
      lt(subscriptions.endDate, nextWeek)
    ),
    limit: 5,
    orderBy: (subscriptions, { asc }) => [asc(subscriptions.endDate)],
    with: {
      tenant: true
    }
  });

  return {
    totalIncome: {
      value: totalIncome,
      growth: incomeGrowth,
      currentMonth: incomeThisMonth
    },
    activeTenants: {
      value: activeTenants,
      newThisMonth: newTenantsThisMonth
    },
    totalOrders: {
      value: totalOrders,
      growth: ordersGrowth,
      currentMonth: ordersThisMonth
    },
    totalUsers: {
      value: totalUsers,
      newThisMonth: newUsersThisMonth
    },
    recentTenants,
    expiringSubscriptions
  };
};

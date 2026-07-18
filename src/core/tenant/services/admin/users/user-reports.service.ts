import {
  orders,
  orderItems,
  cashSessions,
  cashMovements,
  users,
  billingDocuments,
} from '../../../../../db/tenant/schema';
import { eq, and, ne, desc, sql, count, gte, lte } from 'drizzle-orm';
import { getTenantDb } from '../../../../../utils/tenant-context';

const toNum = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value: number) => Number(value.toFixed(2));

// Solo nombres IANA válidos (ej: America/Lima). Evita inyección en AT TIME ZONE.
const TZ_REGEX = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;
const DEFAULT_TZ = 'America/Lima';

export interface UserReportFilters {
  branchId: number;
  startDate: Date;
  endDate: Date;
  timezone?: string;
}

const resolveTz = (tz?: string) => (tz && TZ_REGEX.test(tz) ? tz : DEFAULT_TZ);

/**
 * Ventas como mozo: pedidos cuyo turno generador (cash_session_id)
 * pertenece al usuario. Excluye cancelados.
 */
const waiterOrderConditions = (userId: number, f: UserReportFilters) => [
  eq(orders.branchId, f.branchId),
  gte(orders.createdAt, f.startDate),
  lte(orders.createdAt, f.endDate),
  ne(orders.status, 'cancelled'),
  eq(cashSessions.userId, userId),
];

/**
 * Reporte individual de un usuario: ventas como mozo, cobros como cajero,
 * turnos de caja, entregas como repartidor y comprobantes emitidos.
 */
export const getUserReportSummary = async (userId: number, filters: UserReportFilters) => {
  const db = getTenantDb();
  const tz = resolveTz(filters.timezone);

  const [user] = await db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new Error('Usuario no encontrado');

  const totalExpr = sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`;
  const waiterWhere = and(...waiterOrderConditions(userId, filters));

  // ── Ventas como mozo ────────────────────────────────────────────────
  const [sales] = await db
    .select({ ordersCount: count(), total: totalExpr })
    .from(orders)
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(waiterWhere);

  const [cancelled] = await db
    .select({ ordersCount: count(), total: totalExpr })
    .from(orders)
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(and(
      eq(orders.branchId, filters.branchId),
      gte(orders.createdAt, filters.startDate),
      lte(orders.createdAt, filters.endDate),
      eq(orders.status, 'cancelled'),
      eq(cashSessions.userId, userId),
    ));

  // Serie diaria de mis ventas.
  // GROUP BY 1 (posición): repetir la expresión duplicaría el placeholder de la
  // zona horaria y Postgres trataría cada aparición como una expresión distinta.
  const bucketExpr = sql<string>`to_char(${orders.createdAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
  const series = await db
    .select({ bucket: bucketExpr, ordersCount: count(), total: totalExpr })
    .from(orders)
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(waiterWhere)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  // Mis horas pico (día de semana × hora)
  const dowExpr = sql<number>`EXTRACT(DOW FROM ${orders.createdAt} AT TIME ZONE ${tz})::int`;
  const hourExpr = sql<number>`EXTRACT(HOUR FROM ${orders.createdAt} AT TIME ZONE ${tz})::int`;
  const heatmap = await db
    .select({ dow: dowExpr, hour: hourExpr, ordersCount: count(), totalSales: totalExpr })
    .from(orders)
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(waiterWhere)
    .groupBy(sql`1`, sql`2`);

  // Mis productos más vendidos
  const revenueExpr = sql<string>`COALESCE(SUM(CAST(${orderItems.totalPrice} AS DECIMAL)), 0)`;
  const topProducts = await db
    .select({
      productName: orderItems.productName,
      units: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      revenue: revenueExpr,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(waiterWhere)
    .groupBy(orderItems.productName)
    .orderBy(desc(revenueExpr))
    .limit(10);

  // ── Cobros como cajero (ingresos registrados en MIS turnos) ────────
  const amountExpr = sql<string>`COALESCE(SUM(CAST(${cashMovements.amount} AS DECIMAL)), 0)`;
  const collectedWhere = and(
    eq(cashSessions.branchId, filters.branchId),
    eq(cashSessions.userId, userId),
    gte(cashMovements.createdAt, filters.startDate),
    lte(cashMovements.createdAt, filters.endDate),
    eq(cashMovements.movementType, 'income'),
  );

  const [collected] = await db
    .select({ movesCount: count(), total: amountExpr })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .where(collectedWhere);

  const collectedByMethod = await db
    .select({ label: cashMovements.paymentMethod, moves: count(), total: amountExpr })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .where(collectedWhere)
    .groupBy(cashMovements.paymentMethod);

  // ── Mis turnos de caja ─────────────────────────────────────────────
  const sessions = await db
    .select({
      id: cashSessions.id,
      code: cashSessions.code,
      openingBalance: cashSessions.openingBalance,
      totalIncome: cashSessions.totalIncome,
      totalExpense: cashSessions.totalExpense,
      expectedBalance: cashSessions.expectedBalance,
      closingBalance: cashSessions.closingBalance,
      difference: cashSessions.difference,
      status: cashSessions.status,
      openedAt: cashSessions.openedAt,
      closedAt: cashSessions.closedAt,
    })
    .from(cashSessions)
    .where(and(
      eq(cashSessions.branchId, filters.branchId),
      eq(cashSessions.userId, userId),
      gte(cashSessions.openedAt, filters.startDate),
      lte(cashSessions.openedAt, filters.endDate),
    ))
    .orderBy(desc(cashSessions.openedAt))
    .limit(50);

  // ── Entregas como repartidor ───────────────────────────────────────
  const [deliveries] = await db
    .select({ ordersCount: count(), total: totalExpr })
    .from(orders)
    .where(and(
      eq(orders.branchId, filters.branchId),
      gte(orders.createdAt, filters.startDate),
      lte(orders.createdAt, filters.endDate),
      ne(orders.status, 'cancelled'),
      eq(orders.driverId, userId),
    ));

  // ── Comprobantes emitidos (match por nombre: billing.createdBy guarda el nombre) ──
  const [documents] = await db
    .select({
      docsCount: count(),
      total: sql<string>`COALESCE(SUM(CAST(${billingDocuments.total} AS DECIMAL)), 0)`,
    })
    .from(billingDocuments)
    .where(and(
      eq(billingDocuments.branchId, filters.branchId),
      gte(billingDocuments.issuedAt, filters.startDate),
      lte(billingDocuments.issuedAt, filters.endDate),
      eq(billingDocuments.status, 'issued'),
      eq(billingDocuments.createdBy, user.name),
    ));

  const salesTotal = toNum(sales?.total);
  const salesCount = sales?.ordersCount ?? 0;

  return {
    user: { id: user.id, name: user.name, username: user.username },
    kpis: {
      salesTotal: roundMoney(salesTotal),
      salesCount,
      avgTicket: salesCount > 0 ? roundMoney(salesTotal / salesCount) : 0,
      cancelledCount: cancelled?.ordersCount ?? 0,
      cancelledTotal: roundMoney(toNum(cancelled?.total)),
      collectedTotal: roundMoney(toNum(collected?.total)),
      collectedMoves: collected?.movesCount ?? 0,
      deliveriesCount: deliveries?.ordersCount ?? 0,
      deliveriesTotal: roundMoney(toNum(deliveries?.total)),
      documentsCount: documents?.docsCount ?? 0,
      documentsTotal: roundMoney(toNum(documents?.total)),
      sessionsCount: sessions.length,
      sessionsDifference: roundMoney(
        sessions.reduce((acc, s) => acc + toNum(s.difference), 0),
      ),
    },
    series: series.map((row) => ({
      bucket: row.bucket,
      ordersCount: row.ordersCount,
      total: roundMoney(toNum(row.total)),
    })),
    heatmap: heatmap.map((row) => ({
      dow: row.dow,
      hour: row.hour,
      ordersCount: row.ordersCount,
      totalSales: roundMoney(toNum(row.totalSales)),
    })),
    topProducts: topProducts.map((row) => ({
      productName: row.productName,
      units: toNum(row.units),
      revenue: roundMoney(toNum(row.revenue)),
    })),
    collectedByMethod: collectedByMethod
      .map((row) => ({
        label: row.label || 'Sin método',
        movesCount: row.moves,
        total: roundMoney(toNum(row.total)),
      }))
      .sort((a, b) => b.total - a.total),
    sessions,
  };
};

/**
 * Ranking de usuarios del rango: ventas como mozo, cobros como cajero,
 * diferencias de caja, entregas y comprobantes emitidos, todo por usuario.
 */
export const getUserReportRanking = async (filters: UserReportFilters) => {
  const db = getTenantDb();
  const totalExpr = sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`;

  // Ventas como mozo por usuario
  const sales = await db
    .select({ userId: cashSessions.userId, ordersCount: count(), total: totalExpr })
    .from(orders)
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(and(
      eq(orders.branchId, filters.branchId),
      gte(orders.createdAt, filters.startDate),
      lte(orders.createdAt, filters.endDate),
      ne(orders.status, 'cancelled'),
    ))
    .groupBy(cashSessions.userId);

  // Cobros (ingresos de caja) y diferencias por cajero
  const cash = await db
    .select({
      userId: cashSessions.userId,
      sessionsCount: sql<number>`COUNT(DISTINCT ${cashSessions.id})::int`,
      collected: sql<string>`COALESCE(SUM(CAST(${cashMovements.amount} AS DECIMAL)) FILTER (WHERE ${cashMovements.movementType} = 'income'), 0)`,
    })
    .from(cashSessions)
    .leftJoin(cashMovements, and(
      eq(cashMovements.sessionId, cashSessions.id),
      gte(cashMovements.createdAt, filters.startDate),
      lte(cashMovements.createdAt, filters.endDate),
    ))
    .where(and(
      eq(cashSessions.branchId, filters.branchId),
      gte(cashSessions.openedAt, filters.startDate),
      lte(cashSessions.openedAt, filters.endDate),
    ))
    .groupBy(cashSessions.userId);

  const differences = await db
    .select({
      userId: cashSessions.userId,
      difference: sql<string>`COALESCE(SUM(CAST(${cashSessions.difference} AS DECIMAL)), 0)`,
    })
    .from(cashSessions)
    .where(and(
      eq(cashSessions.branchId, filters.branchId),
      gte(cashSessions.openedAt, filters.startDate),
      lte(cashSessions.openedAt, filters.endDate),
    ))
    .groupBy(cashSessions.userId);

  // Entregas por repartidor
  const deliveries = await db
    .select({ userId: orders.driverId, ordersCount: count(), total: totalExpr })
    .from(orders)
    .where(and(
      eq(orders.branchId, filters.branchId),
      gte(orders.createdAt, filters.startDate),
      lte(orders.createdAt, filters.endDate),
      ne(orders.status, 'cancelled'),
    ))
    .groupBy(orders.driverId);

  // Comprobantes emitidos (por nombre)
  const documents = await db
    .select({
      createdBy: billingDocuments.createdBy,
      docsCount: count(),
      total: sql<string>`COALESCE(SUM(CAST(${billingDocuments.total} AS DECIMAL)), 0)`,
    })
    .from(billingDocuments)
    .where(and(
      eq(billingDocuments.branchId, filters.branchId),
      gte(billingDocuments.issuedAt, filters.startDate),
      lte(billingDocuments.issuedAt, filters.endDate),
      eq(billingDocuments.status, 'issued'),
    ))
    .groupBy(billingDocuments.createdBy);

  const allUsers = await db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(users);

  const byId = new Map<number, {
    userId: number;
    name: string;
    username: string;
    salesCount: number;
    salesTotal: number;
    collectedTotal: number;
    sessionsCount: number;
    difference: number;
    deliveriesCount: number;
    deliveriesTotal: number;
    documentsCount: number;
    documentsTotal: number;
  }>();

  const ensure = (userId: number | null) => {
    if (!userId) return null;
    if (!byId.has(userId)) {
      const user = allUsers.find((u) => u.id === userId);
      if (!user) return null;
      byId.set(userId, {
        userId,
        name: user.name,
        username: user.username,
        salesCount: 0,
        salesTotal: 0,
        collectedTotal: 0,
        sessionsCount: 0,
        difference: 0,
        deliveriesCount: 0,
        deliveriesTotal: 0,
        documentsCount: 0,
        documentsTotal: 0,
      });
    }
    return byId.get(userId)!;
  };

  for (const row of sales) {
    const entry = ensure(row.userId);
    if (!entry) continue;
    entry.salesCount = row.ordersCount;
    entry.salesTotal = roundMoney(toNum(row.total));
  }
  for (const row of cash) {
    const entry = ensure(row.userId);
    if (!entry) continue;
    entry.sessionsCount = row.sessionsCount;
    entry.collectedTotal = roundMoney(toNum(row.collected));
  }
  for (const row of differences) {
    const entry = ensure(row.userId);
    if (!entry) continue;
    entry.difference = roundMoney(toNum(row.difference));
  }
  for (const row of deliveries) {
    const entry = ensure(row.userId);
    if (!entry) continue;
    entry.deliveriesCount = row.ordersCount;
    entry.deliveriesTotal = roundMoney(toNum(row.total));
  }
  // Los comprobantes se registran por nombre (createdBy); se cruza contra users.name
  for (const row of documents) {
    if (!row.createdBy) continue;
    const user = allUsers.find((u) => u.name === row.createdBy);
    const entry = ensure(user?.id ?? null);
    if (!entry) continue;
    entry.documentsCount = row.docsCount;
    entry.documentsTotal = roundMoney(toNum(row.total));
  }

  return [...byId.values()].sort(
    (a, b) => (b.salesTotal + b.collectedTotal) - (a.salesTotal + a.collectedTotal),
  );
};

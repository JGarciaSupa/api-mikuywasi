import {
  orders,
  orderItems,
  cashSessions,
  cashMovements,
  users,
  billingDocuments,
} from '../../../../../db/tenant/schema';
import { eq, and, ne, desc, sql, count, gte, lte, isNull } from 'drizzle-orm';
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
  // Turno puntual (opcional): pedidos generados en ese turno, sus movimientos de caja,
  // el propio turno y los comprobantes de sus pedidos
  sessionId?: number;
}

// Filtros por turno de cada tabla (vacíos sin sessionId: comportamiento de siempre)
const inSession = {
  orders: (f: UserReportFilters) => (f.sessionId ? [eq(orders.cashSessionId, f.sessionId)] : []),
  movements: (f: UserReportFilters) => (f.sessionId ? [eq(cashMovements.sessionId, f.sessionId)] : []),
  sessions: (f: UserReportFilters) => (f.sessionId ? [eq(cashSessions.id, f.sessionId)] : []),
  documents: (f: UserReportFilters) => (f.sessionId
    ? [sql`EXISTS (SELECT 1 FROM orders o WHERE o.id = ${billingDocuments.orderId} AND (o.cash_session_id = ${f.sessionId} OR o.collected_session_id = ${f.sessionId}))`]
    : []),
};

const resolveTz = (tz?: string) => (tz && TZ_REGEX.test(tz) ? tz : DEFAULT_TZ);

/**
 * Propinas por mozo: propinas de los cobros (cash_movements.tip_amount, ya incluidas en el
 * ingreso) de pedidos con ese mozo asignado (orders.waiter_id), sin los cobros revertidos.
 * Rango por fecha del cobro.
 */
const tipsByWaiter = (f: UserReportFilters, userId?: number) => {
  const db = getTenantDb();
  const conditions = [
    eq(orders.branchId, f.branchId),
    eq(cashMovements.movementType, 'income'),
    gte(cashMovements.createdAt, f.startDate),
    lte(cashMovements.createdAt, f.endDate),
    ...inSession.movements(f),
    sql`CAST(${cashMovements.tipAmount} AS DECIMAL) > 0`,
    sql`NOT EXISTS (SELECT 1 FROM cash_movements r WHERE r.session_id = ${cashMovements.sessionId} AND r.movement_type = 'expense'
      AND r.reference = 'reverso' AND r.order_id IS NOT DISTINCT FROM ${cashMovements.orderId} AND r.split_id IS NOT DISTINCT FROM ${cashMovements.splitId})`,
  ];
  if (userId) conditions.push(eq(orders.waiterId, userId));
  return db
    .select({
      userId: orders.waiterId,
      tipsCount: count(),
      tipsTotal: sql<string>`COALESCE(SUM(CAST(${cashMovements.tipAmount} AS DECIMAL)), 0)`,
    })
    .from(cashMovements)
    .innerJoin(orders, eq(cashMovements.orderId, orders.id))
    .where(and(...conditions))
    .groupBy(orders.waiterId);
};

// El pedido entra a la caja que está abierta, así que cash_session_id es del cajero.
// La venta del mozo es orders.waiter_id. Si el pedido no tiene mozo (kiosko, web),
// se queda en el dueño del turno para no perderla.
const waiterOwnerExpr = sql<number>`COALESCE(${orders.waiterId}, ${cashSessions.userId})`;

/**
 * Ventas como mozo: pedidos asignados a este usuario. Excluye cancelados.
 */
const waiterOrderConditions = (userId: number, f: UserReportFilters) => [
  eq(orders.branchId, f.branchId),
  gte(orders.createdAt, f.startDate),
  lte(orders.createdAt, f.endDate),
  ...inSession.orders(f),
  ne(orders.status, 'cancelled'),
  sql`${waiterOwnerExpr} = ${userId}`,
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
      ...inSession.orders(filters),
      eq(orders.status, 'cancelled'),
      sql`${waiterOwnerExpr} = ${userId}`,
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
    .where(and(waiterWhere, isNull(orderItems.deletedAt)))
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
    ...inSession.movements(filters),
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
      ...inSession.sessions(filters),
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
      ...inSession.orders(filters),
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
      ...inSession.documents(filters),
      eq(billingDocuments.status, 'issued'),
      eq(billingDocuments.createdBy, user.name),
    ));

  // ── Propinas como mozo (pedidos con este mozo asignado) ─────────────
  const [tips] = await tipsByWaiter(filters, userId);

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
      tipsTotal: roundMoney(toNum(tips?.tipsTotal)),
      tipsCount: tips?.tipsCount ?? 0,
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

  // Ventas como mozo por usuario (quien tomó el pedido, no quien tiene la caja)
  const sales = await db
    .select({ userId: waiterOwnerExpr, ordersCount: count(), total: totalExpr })
    .from(orders)
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(and(
      eq(orders.branchId, filters.branchId),
      gte(orders.createdAt, filters.startDate),
      lte(orders.createdAt, filters.endDate),
      ...inSession.orders(filters),
      ne(orders.status, 'cancelled'),
    ))
    .groupBy(sql`1`);

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
      ...inSession.movements(filters),
    ))
    .where(and(
      eq(cashSessions.branchId, filters.branchId),
      gte(cashSessions.openedAt, filters.startDate),
      lte(cashSessions.openedAt, filters.endDate),
      ...inSession.sessions(filters),
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
      ...inSession.sessions(filters),
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
      ...inSession.orders(filters),
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
      ...inSession.documents(filters),
      eq(billingDocuments.status, 'issued'),
    ))
    .groupBy(billingDocuments.createdBy);

  // Propinas por mozo asignado
  const tips = await tipsByWaiter(filters);

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
    tipsTotal: number;
    tipsCount: number;
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
        tipsTotal: 0,
        tipsCount: 0,
        documentsCount: 0,
        documentsTotal: 0,
      });
    }
    return byId.get(userId)!;
  };

  for (const row of sales) {
    const entry = ensure(Number(row.userId));
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
  for (const row of tips) {
    const entry = ensure(row.userId);
    if (!entry) continue;
    entry.tipsTotal = roundMoney(toNum(row.tipsTotal));
    entry.tipsCount = row.tipsCount;
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

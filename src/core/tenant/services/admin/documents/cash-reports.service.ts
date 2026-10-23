import { cashSessions, cashMovements, cashRegisters, users, orders, orderItems, ordersItemsDeleted } from '../../../../../db/tenant/schema';
import { eq, and, ne, desc, asc, sql, count, gte, lte, isNull, isNotNull } from 'drizzle-orm';
import { getTenantDb } from '../../../../../utils/tenant-context';

const toNum = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value: number) => Number(value.toFixed(2));

// Solo nombres IANA válidos (ej: America/Lima). Evita inyección en AT TIME ZONE.
const TZ_REGEX = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;
const DEFAULT_TZ = 'America/Lima';

export interface CashReportFilters {
  branchId: number;
  startDate: Date;
  endDate: Date;
  timezone?: string;
  registerId?: number;
  userId?: number; // cajero del turno
  /** Turno puntual (solo lo aplican anulaciones y paloteo: pedidos creados en ese turno) */
  sessionId?: number;
}

const resolveTz = (tz?: string) => (tz && TZ_REGEX.test(tz) ? tz : DEFAULT_TZ);

/** Condiciones sobre turnos (rango por fecha de apertura) */
const sessionConditions = (f: CashReportFilters) => {
  const conditions = [
    eq(cashSessions.branchId, f.branchId),
    gte(cashSessions.openedAt, f.startDate),
    lte(cashSessions.openedAt, f.endDate),
  ];
  if (f.registerId) conditions.push(eq(cashSessions.registerId, f.registerId));
  if (f.userId) conditions.push(eq(cashSessions.userId, f.userId));
  return conditions;
};

/** Condiciones sobre movimientos (rango por fecha del movimiento, join a su turno) */
const movementConditions = (f: CashReportFilters) => {
  const conditions = [
    eq(cashSessions.branchId, f.branchId),
    gte(cashMovements.createdAt, f.startDate),
    lte(cashMovements.createdAt, f.endDate),
  ];
  if (f.registerId) conditions.push(eq(cashSessions.registerId, f.registerId));
  if (f.userId) conditions.push(eq(cashSessions.userId, f.userId));
  return conditions;
};

/**
 * Resumen de caja: KPIs de movimientos y turnos + series diarias + desgloses
 */
export const getCashReportSummary = async (filters: CashReportFilters) => {
  const db = getTenantDb();
  const tz = resolveTz(filters.timezone);
  const movesWhere = and(...movementConditions(filters));
  const sessionsWhere = and(...sessionConditions(filters));

  const amountExpr = sql<string>`COALESCE(SUM(CAST(${cashMovements.amount} AS DECIMAL)), 0)`;

  // Totales por tipo de movimiento
  const byType = await db
    .select({ type: cashMovements.movementType, moves: count(), total: amountExpr })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .where(movesWhere)
    .groupBy(cashMovements.movementType);

  const totals: Record<string, { moves: number; total: number }> = {};
  for (const row of byType) {
    totals[row.type] = { moves: row.moves, total: roundMoney(toNum(row.total)) };
  }
  const income = totals.income ?? { moves: 0, total: 0 };
  const expense = totals.expense ?? { moves: 0, total: 0 };
  const withdrawal = totals.withdrawal ?? { moves: 0, total: 0 };
  const deposit = totals.deposit ?? { moves: 0, total: 0 };

  // Turnos: conteos y diferencias (solo cerrados tienen diferencia)
  const [sessionsAgg] = await db
    .select({
      sessionsCount: count(),
      totalDifference: sql<string>`COALESCE(SUM(CAST(${cashSessions.difference} AS DECIMAL)), 0)`,
      closedCount: sql<number>`COUNT(*) FILTER (WHERE ${cashSessions.status} = 'closed')::int`,
      shortageCount: sql<number>`COUNT(*) FILTER (WHERE CAST(${cashSessions.difference} AS DECIMAL) < 0)::int`,
      overageCount: sql<number>`COUNT(*) FILTER (WHERE CAST(${cashSessions.difference} AS DECIMAL) > 0)::int`,
    })
    .from(cashSessions)
    .where(sessionsWhere);

  // Series diarias de ingresos y egresos (egresos = gastos + retiros)
  const bucketExpr = sql<string>`to_char(${cashMovements.createdAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
  // GROUP BY 1 (posición): repetir la expresión duplicaría el placeholder de la
  // zona horaria y Postgres trataría cada aparición como una expresión distinta.
  const series = await db
    .select({
      bucket: bucketExpr,
      movesCount: count(),
      income: sql<string>`COALESCE(SUM(CAST(${cashMovements.amount} AS DECIMAL)) FILTER (WHERE ${cashMovements.movementType} IN ('income', 'deposit')), 0)`,
      expense: sql<string>`COALESCE(SUM(CAST(${cashMovements.amount} AS DECIMAL)) FILTER (WHERE ${cashMovements.movementType} IN ('expense', 'withdrawal')), 0)`,
    })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .where(movesWhere)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  // Ingresos por método de pago
  const byPaymentMethod = await db
    .select({
      label: cashMovements.paymentMethod,
      moves: count(),
      total: amountExpr,
    })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .where(and(movesWhere, eq(cashMovements.movementType, 'income')))
    .groupBy(cashMovements.paymentMethod);

  // Top conceptos de gasto (en qué se va la plata de caja)
  const topExpenseConcepts = await db
    .select({
      label: cashMovements.concept,
      moves: count(),
      total: amountExpr,
    })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .where(and(movesWhere, eq(cashMovements.movementType, 'expense')))
    .groupBy(cashMovements.concept)
    .orderBy(desc(amountExpr))
    .limit(10);

  // Por caja: ingresos y diferencia acumulada de sus turnos
  const byRegister = await db
    .select({
      label: cashRegisters.name,
      sessions: count(),
      income: sql<string>`COALESCE(SUM(CAST(${cashSessions.totalIncome} AS DECIMAL)), 0)`,
      difference: sql<string>`COALESCE(SUM(CAST(${cashSessions.difference} AS DECIMAL)), 0)`,
    })
    .from(cashSessions)
    .leftJoin(cashRegisters, eq(cashSessions.registerId, cashRegisters.id))
    .where(sessionsWhere)
    .groupBy(cashRegisters.name);

  // Por cajero: turnos, ingresos y diferencia acumulada (detecta faltantes sistemáticos)
  const byCashier = await db
    .select({
      label: users.name,
      sessions: count(),
      income: sql<string>`COALESCE(SUM(CAST(${cashSessions.totalIncome} AS DECIMAL)), 0)`,
      difference: sql<string>`COALESCE(SUM(CAST(${cashSessions.difference} AS DECIMAL)), 0)`,
    })
    .from(cashSessions)
    .leftJoin(users, eq(cashSessions.userId, users.id))
    .where(sessionsWhere)
    .groupBy(users.name);

  const mapMoney = <T extends { total: string; moves: number }>(
    rows: (T & { label: string | null })[],
    fallback: string,
  ) =>
    rows
      .map((row) => ({
        label: row.label || fallback,
        movesCount: row.moves,
        total: roundMoney(toNum(row.total)),
      }))
      .sort((a, b) => b.total - a.total);

  const mapSessionRows = (
    rows: { label: string | null; sessions: number; income: string; difference: string }[],
    fallback: string,
  ) =>
    rows
      .map((row) => ({
        label: row.label || fallback,
        sessionsCount: row.sessions,
        income: roundMoney(toNum(row.income)),
        difference: roundMoney(toNum(row.difference)),
      }))
      .sort((a, b) => b.income - a.income);

  return {
    kpis: {
      totalIncome: income.total,
      incomeMoves: income.moves,
      totalExpense: expense.total,
      expenseMoves: expense.moves,
      totalWithdrawal: withdrawal.total,
      totalDeposit: deposit.total,
      netFlow: roundMoney(income.total + deposit.total - expense.total - withdrawal.total),
      sessionsCount: sessionsAgg?.sessionsCount ?? 0,
      closedCount: sessionsAgg?.closedCount ?? 0,
      shortageCount: sessionsAgg?.shortageCount ?? 0,
      overageCount: sessionsAgg?.overageCount ?? 0,
      totalDifference: roundMoney(toNum(sessionsAgg?.totalDifference)),
    },
    series: series.map((row) => ({
      bucket: row.bucket,
      movesCount: row.movesCount,
      income: roundMoney(toNum(row.income)),
      expense: roundMoney(toNum(row.expense)),
    })),
    byPaymentMethod: mapMoney(byPaymentMethod, 'Sin método'),
    topExpenseConcepts: mapMoney(topExpenseConcepts, 'Sin concepto'),
    byRegister: mapSessionRows(byRegister, 'Sin caja'),
    byCashier: mapSessionRows(byCashier, 'Sin cajero'),
  };
};

/** Turnos del rango para la tabla histórica (más recientes primero) */
export const getCashReportSessions = async (filters: CashReportFilters, limit = 200) => {
  const db = getTenantDb();

  const rows = await db
    .select({
      id: cashSessions.id,
      code: cashSessions.code,
      registerName: cashRegisters.name,
      cashierName: users.name,
      openedBy: cashSessions.openedBy,
      closedBy: cashSessions.closedBy,
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
    .leftJoin(cashRegisters, eq(cashSessions.registerId, cashRegisters.id))
    .leftJoin(users, eq(cashSessions.userId, users.id))
    .where(and(...sessionConditions(filters)))
    .orderBy(desc(cashSessions.openedAt))
    .limit(limit);

  return rows;
};

/** Movimientos del rango para la tabla histórica (más recientes primero) */
export const getCashReportMovements = async (
  filters: CashReportFilters,
  movementType?: 'income' | 'expense' | 'withdrawal' | 'deposit',
  limit = 200,
) => {
  const db = getTenantDb();
  const conditions = movementConditions(filters);
  if (movementType) conditions.push(eq(cashMovements.movementType, movementType));

  const rows = await db
    .select({
      id: cashMovements.id,
      createdAt: cashMovements.createdAt,
      sessionCode: cashSessions.code,
      registerName: cashRegisters.name,
      movementType: cashMovements.movementType,
      concept: cashMovements.concept,
      amount: cashMovements.amount,
      paymentMethod: cashMovements.paymentMethod,
      isCash: cashMovements.isCash,
      orderId: cashMovements.orderId,
      orderTrackingCode: orders.trackingCode,
      createdBy: cashMovements.createdBy,
    })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .leftJoin(cashRegisters, eq(cashSessions.registerId, cashRegisters.id))
    .leftJoin(orders, eq(cashMovements.orderId, orders.id))
    .where(and(...conditions))
    .orderBy(desc(cashMovements.createdAt))
    .limit(limit);

  return rows;
};

/**
 * Filtros de caja/cajero sobre pedidos: se aplican al turno que generó el pedido
 * (orders.cash_session_id). El rango de fechas lo pone cada consulta según su evento.
 */
const orderSessionConditions = (f: CashReportFilters) => {
  const conditions = [eq(orders.branchId, f.branchId)];
  if (f.sessionId) conditions.push(eq(cashSessions.id, f.sessionId));
  if (f.registerId) conditions.push(eq(cashSessions.registerId, f.registerId));
  if (f.userId) conditions.push(eq(cashSessions.userId, f.userId));
  return conditions;
};

/** Tope de filas de anulaciones/paloteo: deben salir completos para imprimirse. */
const PRINT_MAX_ROWS = 2000;

/**
 * Anulaciones del rango (más recientes primero). Une los dos orígenes:
 * - Ítems anulados (total o parcial): log en orders_items_deleted, fecha del evento.
 * - Pedidos anulados completos: status='cancelled' con deleted_date. Sus ítems vivos
 *   (los anulados antes ya están en el log). Un pedido que quedó 'cancelled' por mover
 *   todos sus ítems a otra mesa no tiene deleted_date y no cuenta como anulación.
 * El importe es precio unitario × cantidad anulada.
 */
export const getCashReportVoids = async (filters: CashReportFilters) => {
  const db = getTenantDb();

  const itemVoids = await db
    .select({
      createdAt: ordersItemsDeleted.createdAt,
      orderId: orders.id,
      orderTrackingCode: orders.trackingCode,
      productName: orderItems.productName,
      quantity: sql<number>`COALESCE(${ordersItemsDeleted.quantity}, ${orderItems.quantity})`,
      unitPrice: orderItems.unitPrice,
      motivo: ordersItemsDeleted.motivo,
    })
    .from(ordersItemsDeleted)
    .innerJoin(orderItems, eq(ordersItemsDeleted.orderItemId, orderItems.id))
    .innerJoin(orders, eq(ordersItemsDeleted.orderId, orders.id))
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(and(
      ...orderSessionConditions(filters),
      gte(ordersItemsDeleted.createdAt, filters.startDate),
      lte(ordersItemsDeleted.createdAt, filters.endDate),
    ))
    .orderBy(desc(ordersItemsDeleted.createdAt))
    .limit(PRINT_MAX_ROWS);

  const orderVoids = await db
    .select({
      createdAt: orders.deletedDate,
      orderId: orders.id,
      orderTrackingCode: orders.trackingCode,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      motivo: orders.motivo,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(and(
      ...orderSessionConditions(filters),
      eq(orders.status, 'cancelled'),
      isNotNull(orders.deletedDate),
      isNull(orderItems.deletedAt),
      gte(orders.deletedDate, filters.startDate),
      lte(orders.deletedDate, filters.endDate),
    ))
    .orderBy(desc(orders.deletedDate))
    .limit(PRINT_MAX_ROWS);

  const rows = [
    ...itemVoids.map((r) => ({ ...r, scope: 'item' as const })),
    ...orderVoids.map((r) => ({ ...r, scope: 'order' as const })),
  ]
    .map((r) => {
      const quantity = toNum(r.quantity);
      return {
        createdAt: r.createdAt,
        scope: r.scope,
        orderId: r.orderId,
        orderCode: r.orderTrackingCode || r.orderId,
        productName: r.productName,
        quantity,
        total: roundMoney(toNum(r.unitPrice) * quantity),
        motivo: r.motivo,
      };
    })
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

  return {
    rows,
    totalQuantity: rows.reduce((acc, r) => acc + r.quantity, 0),
    totalAmount: roundMoney(rows.reduce((acc, r) => acc + r.total, 0)),
    truncated: itemVoids.length === PRINT_MAX_ROWS || orderVoids.length === PRINT_MAX_ROWS,
  };
};

/**
 * Paloteo de producción: unidades vendidas por producto en el rango (fecha del pedido).
 * Excluye pedidos anulados e ítems anulados; las anulaciones parciales ya restaron
 * su cantidad de la línea. El total es el importe cobrado de la línea (con descuentos).
 */
export const getCashReportProduction = async (filters: CashReportFilters) => {
  const db = getTenantDb();
  const quantityExpr = sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)`;

  const rows = await db
    .select({
      productName: orderItems.productName,
      quantity: quantityExpr,
      total: sql<string>`COALESCE(SUM(CAST(${orderItems.totalPrice} AS DECIMAL)), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .where(and(
      ...orderSessionConditions(filters),
      ne(orders.status, 'cancelled'),
      isNull(orderItems.deletedAt),
      gte(orders.createdAt, filters.startDate),
      lte(orders.createdAt, filters.endDate),
    ))
    .groupBy(orderItems.productName)
    .orderBy(desc(quantityExpr), asc(orderItems.productName))
    .limit(PRINT_MAX_ROWS);

  const mapped = rows.map((r) => ({
    productName: r.productName,
    quantity: toNum(r.quantity),
    total: roundMoney(toNum(r.total)),
  }));

  return {
    rows: mapped,
    totalQuantity: mapped.reduce((acc, r) => acc + r.quantity, 0),
    totalAmount: roundMoney(mapped.reduce((acc, r) => acc + r.total, 0)),
    truncated: rows.length === PRINT_MAX_ROWS,
  };
};

/** Tope de filas del export para no tumbar el server con rangos gigantes */
const EXPORT_MAX_ROWS = 20000;

/**
 * Dataset plano para el Excel: turnos + movimientos completos del rango.
 */
export const getCashReportExport = async (filters: CashReportFilters) => {
  const db = getTenantDb();

  const sessions = await db
    .select({
      code: cashSessions.code,
      registerName: cashRegisters.name,
      cashierName: users.name,
      openedBy: cashSessions.openedBy,
      closedBy: cashSessions.closedBy,
      openingBalance: cashSessions.openingBalance,
      totalIncome: cashSessions.totalIncome,
      totalExpense: cashSessions.totalExpense,
      expectedBalance: cashSessions.expectedBalance,
      closingBalance: cashSessions.closingBalance,
      difference: cashSessions.difference,
      status: cashSessions.status,
      notes: cashSessions.notes,
      openedAt: cashSessions.openedAt,
      closedAt: cashSessions.closedAt,
    })
    .from(cashSessions)
    .leftJoin(cashRegisters, eq(cashSessions.registerId, cashRegisters.id))
    .leftJoin(users, eq(cashSessions.userId, users.id))
    .where(and(...sessionConditions(filters)))
    .orderBy(asc(cashSessions.openedAt))
    .limit(EXPORT_MAX_ROWS);

  const movements = await db
    .select({
      createdAt: cashMovements.createdAt,
      sessionCode: cashSessions.code,
      registerName: cashRegisters.name,
      movementType: cashMovements.movementType,
      concept: cashMovements.concept,
      amount: cashMovements.amount,
      paymentMethod: cashMovements.paymentMethod,
      isCash: cashMovements.isCash,
      orderId: cashMovements.orderId,
      orderTrackingCode: orders.trackingCode,
      reference: cashMovements.reference,
      createdBy: cashMovements.createdBy,
    })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .leftJoin(cashRegisters, eq(cashSessions.registerId, cashRegisters.id))
    .leftJoin(orders, eq(cashMovements.orderId, orders.id))
    .where(and(...movementConditions(filters)))
    .orderBy(asc(cashMovements.createdAt))
    .limit(EXPORT_MAX_ROWS);

  return {
    sessions,
    movements,
    truncated: sessions.length === EXPORT_MAX_ROWS || movements.length === EXPORT_MAX_ROWS,
  };
};

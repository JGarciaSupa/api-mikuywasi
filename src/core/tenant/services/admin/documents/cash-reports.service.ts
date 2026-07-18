import { cashSessions, cashMovements, cashRegisters, users } from '../../../../../db/tenant/schema';
import { eq, and, desc, asc, sql, count, gte, lte } from 'drizzle-orm';
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
      createdBy: cashMovements.createdBy,
    })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .leftJoin(cashRegisters, eq(cashSessions.registerId, cashRegisters.id))
    .where(and(...conditions))
    .orderBy(desc(cashMovements.createdAt))
    .limit(limit);

  return rows;
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
      reference: cashMovements.reference,
      createdBy: cashMovements.createdBy,
    })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashMovements.sessionId, cashSessions.id))
    .leftJoin(cashRegisters, eq(cashSessions.registerId, cashRegisters.id))
    .where(and(...movementConditions(filters)))
    .orderBy(asc(cashMovements.createdAt))
    .limit(EXPORT_MAX_ROWS);

  return {
    sessions,
    movements,
    truncated: sessions.length === EXPORT_MAX_ROWS || movements.length === EXPORT_MAX_ROWS,
  };
};

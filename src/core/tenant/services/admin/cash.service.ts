import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { cashSessions, cashMovements, orders } from '../../../../db/tenant/schema';
import { getTenantDb } from '../../../../utils/tenant-context';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import type { AuditActor } from '../warehouse/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  return parseFloat(String(v ?? '0')) || 0;
}

function round2(n: number): string {
  return n.toFixed(2);
}

// Auto-generate session code: CAJA-YYYYMMDD-NNN
async function nextCode(): Promise<string> {
  const db = getTenantDb();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `CAJA-${today}-`;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cashSessions)
    .where(sql`${cashSessions.code} LIKE ${prefix + '%'}`);
  const seq = ((row?.count ?? 0) + 1).toString().padStart(3, '0');
  return `${prefix}${seq}`;
}

// ─── queries ──────────────────────────────────────────────────────────────────

export async function listCashSessions(filters?: { status?: string; from?: string; to?: string }) {
  const db = getTenantDb();
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.status) conditions.push(eq(cashSessions.status, filters.status as 'open' | 'closed'));
  if (filters?.from) conditions.push(gte(cashSessions.openedAt, new Date(filters.from)));
  if (filters?.to) conditions.push(lte(cashSessions.openedAt, new Date(filters.to + 'T23:59:59')));

  const q = db.select().from(cashSessions).orderBy(desc(cashSessions.openedAt));
  return conditions.length ? q.where(and(...conditions)) : q;
}

export async function getCurrentCashSession() {
  const db = getTenantDb();
  const [session] = await db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.status, 'open'))
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);
  return session ?? null;
}

export async function getCashSessionById(id: number) {
  const db = getTenantDb();
  const [session] = await db.select().from(cashSessions).where(eq(cashSessions.id, id));
  if (!session) return null;
  const movements = await db
    .select({
      movement: cashMovements,
      orderTotal: orders.total,
    })
    .from(cashMovements)
    .leftJoin(orders, eq(cashMovements.orderId, orders.id))
    .where(eq(cashMovements.sessionId, id))
    .orderBy(desc(cashMovements.createdAt));
  return { ...session, movements: movements.map((r) => ({ ...r.movement, orderTotal: r.orderTotal })) };
}

// ─── mutations ────────────────────────────────────────────────────────────────

export async function openCashSession(
  data: { openingBalance: number; notes?: string },
  actor?: AuditActor
) {
  const db = getTenantDb();

  // Only one open session at a time
  const existing = await getCurrentCashSession();
  if (existing) throw new Error(`Ya hay una sesión abierta: ${existing.code}`);

  const code = await nextCode();
  const [session] = await db
    .insert(cashSessions)
    .values({
      code,
      openedBy: actor?.userName ?? 'sistema',
      openingBalance: round2(data.openingBalance),
      expectedBalance: round2(data.openingBalance),
      notes: data.notes,
      status: 'open',
    })
    .returning();

  await writeAuditLog({
    tableName: 'cash_sessions',
    operation: 'INSERT',
    recordId: session.id,
    afterData: session,
    actor,
    description: `Sesión de caja abierta: ${code} con saldo inicial S/ ${round2(data.openingBalance)}`,
  });

  return session;
}

export async function addCashMovement(
  sessionId: number,
  data: {
    movementType: 'income' | 'expense' | 'withdrawal' | 'deposit';
    concept: string;
    amount: number;
    paymentMethod?: string;
    orderId?: string;
    reference?: string;
  },
  actor?: AuditActor
) {
  const db = getTenantDb();

  const [session] = await db.select().from(cashSessions).where(eq(cashSessions.id, sessionId));
  if (!session) throw new Error('Sesión no encontrada');
  if (session.status !== 'open') throw new Error('La sesión ya está cerrada');

  return db.transaction(async (tx) => {
    const [movement] = await tx
      .insert(cashMovements)
      .values({
        sessionId,
        movementType: data.movementType,
        concept: data.concept,
        amount: round2(data.amount),
        paymentMethod: data.paymentMethod,
        orderId: data.orderId ?? null,
        reference: data.reference,
        createdBy: actor?.userName ?? 'sistema',
      })
      .returning();

    // Update running totals on session
    const isIn = data.movementType === 'income' || data.movementType === 'deposit';
    const curIncome = toNum(session.totalIncome);
    const curExpense = toNum(session.totalExpense);
    const newIncome = isIn ? curIncome + data.amount : curIncome;
    const newExpense = !isIn ? curExpense + data.amount : curExpense;
    const newExpected = toNum(session.openingBalance) + newIncome - newExpense;

    const [updated] = await tx
      .update(cashSessions)
      .set({
        totalIncome: round2(newIncome),
        totalExpense: round2(newExpense),
        expectedBalance: round2(newExpected),
      })
      .where(eq(cashSessions.id, sessionId))
      .returning();

    await writeAuditLog({
      tableName: 'cash_movements',
      operation: 'INSERT',
      recordId: movement.id,
      afterData: movement,
      actor,
      description: `Movimiento de caja [${data.movementType}]: ${data.concept} — S/ ${round2(data.amount)}`,
    });

    return { movement, session: updated };
  });
}

export async function closeCashSession(
  id: number,
  data: { closingBalance: number; notes?: string },
  actor?: AuditActor
) {
  const db = getTenantDb();

  const [session] = await db.select().from(cashSessions).where(eq(cashSessions.id, id));
  if (!session) throw new Error('Sesión no encontrada');
  if (session.status !== 'open') throw new Error('La sesión ya está cerrada');

  const difference = data.closingBalance - toNum(session.expectedBalance);

  const [closed] = await db
    .update(cashSessions)
    .set({
      status: 'closed',
      closedBy: actor?.userName ?? 'sistema',
      closingBalance: round2(data.closingBalance),
      difference: round2(difference),
      notes: data.notes ?? session.notes,
      closedAt: new Date(),
    })
    .where(eq(cashSessions.id, id))
    .returning();

  await writeAuditLog({
    tableName: 'cash_sessions',
    operation: 'UPDATE',
    recordId: id,
    beforeData: session,
    afterData: closed,
    actor,
    description: `Sesión de caja cerrada: ${session.code}. Diferencia: S/ ${round2(difference)}`,
  });

  return closed;
}

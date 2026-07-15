import { eq, desc, and, gte, lte, sql, ilike, isNull } from 'drizzle-orm';
import { cashSessions, cashMovements, orders, cashRegisters, cashSessionSequences, users, paymentMethods, orderSplits, branches } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import type { AuditActor } from '../warehouse/types';
import { createExchangeRate } from '../config-local/exchange-rate.service';

// ─── helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  return parseFloat(String(v ?? '0')) || 0;
}

function round2(n: number): string {
  return n.toFixed(2);
}

// ¿El movimiento afecta el EFECTIVO físico de la caja? (para el arqueo)
// Efectivo = método vacío/null (movimientos manuales, retiros, depósitos) o 'cash'/'efectivo'.
// Yape/tarjeta/transferencia NO afectan el efectivo físico (van al banco).
function isCashMethod(method?: string | null): boolean {
  const m = (method ?? '').toLowerCase().trim();
  return m === '' || m === 'cash' || m === 'efectivo';
}

// Resuelve si un método de pago cuenta como EFECTIVO físico, usando la tabla
// payment_methods (fuente de verdad: flag isCash). Si no hay método (retiros/
// depósitos/manuales) => efectivo. Si el método no existe en la tabla => heurística por texto.
async function resolveIsCash(methodName?: string | null): Promise<boolean> {
  const m = (methodName ?? '').trim();
  if (!m) return true;
  const db = getTenantDb();
  const [pm] = await db
    .select({ isCash: paymentMethods.isCash })
    .from(paymentMethods)
    .where(ilike(paymentMethods.name, m))
    .limit(1);
  if (pm) return pm.isCash;
  return isCashMethod(m);
}

// Resuelve isCash por id del método (relación estable). Si no hay id, cae al nombre.
async function resolveIsCashByMethod(methodId?: number | null, methodName?: string | null): Promise<boolean> {
  if (methodId) {
    const db = getTenantDb();
    const [pm] = await db.select({ isCash: paymentMethods.isCash }).from(paymentMethods).where(eq(paymentMethods.id, methodId)).limit(1);
    if (pm) return pm.isCash;
  }
  return resolveIsCash(methodName);
}

type TxClient = Parameters<Parameters<ReturnType<typeof getTenantDb>['transaction']>[0]>[0];

// Recalcula los acumulados del turno a partir de TODOS sus movimientos.
// totalIncome/totalExpense = todos los métodos (cifras de negocio);
// expectedBalance = SOLO EFECTIVO (apertura + ingresos efectivo - egresos efectivo),
// para que el arqueo físico cuadre con el conteo de billetes.
async function recomputeSessionTotals(tx: TxClient, sessionId: number) {
  const [session] = await tx.select().from(cashSessions).where(eq(cashSessions.id, sessionId));
  if (!session) return null;
  const movements = await tx.select().from(cashMovements).where(eq(cashMovements.sessionId, sessionId));

  let totalIncome = 0, totalExpense = 0, cashIn = 0, cashOut = 0;
  for (const m of movements) {
    const amt = toNum(m.amount);
    const isIn = m.movementType === 'income' || m.movementType === 'deposit';
    // Usa el flag congelado del movimiento; si es null (legacy) cae al reconocimiento por texto.
    const cash = m.isCash != null ? m.isCash : isCashMethod(m.paymentMethod);
    if (isIn) { totalIncome += amt; if (cash) cashIn += amt; }
    else { totalExpense += amt; if (cash) cashOut += amt; }
  }
  const expected = toNum(session.openingBalance) + cashIn - cashOut;

  const [updated] = await tx
    .update(cashSessions)
    .set({
      totalIncome: round2(totalIncome),
      totalExpense: round2(totalExpense),
      expectedBalance: round2(expected),
    })
    .where(eq(cashSessions.id, sessionId))
    .returning();
  return updated;
}

// Correlativo del turno: YY + 7 dígitos (ej: '260000001'), reiniciado cada año por sucursal.
// Usa un contador atómico (UPSERT) por (sucursal, año) para evitar duplicados/huecos en concurrencia.
// Debe ejecutarse dentro de una transacción (recibe el tx).
async function nextSessionCorrelative(
  tx: Parameters<Parameters<ReturnType<typeof getTenantDb>['transaction']>[0]>[0],
  branchId: number,
  year: number,
): Promise<{ sequence: number; code: string }> {
  const [row] = await tx
    .insert(cashSessionSequences)
    .values({ branchId, year, lastSequence: 1 })
    .onConflictDoUpdate({
      target: [cashSessionSequences.branchId, cashSessionSequences.year],
      set: { lastSequence: sql`${cashSessionSequences.lastSequence} + 1` },
    })
    .returning({ lastSequence: cashSessionSequences.lastSequence });

  const sequence = row.lastSequence;
  const yy = (year % 100).toString().padStart(2, '0');
  const code = `${yy}${sequence.toString().padStart(7, '0')}`;
  return { sequence, code };
}

// ─── registers crud ──────────────────────────────────────────────────────────

export async function listCashRegisters(branchId?: number) {
  const db = getTenantDb();
  const conditions = [];
  if (branchId) conditions.push(eq(cashRegisters.branchId, branchId));

  const registers = await (conditions.length
    ? db.select().from(cashRegisters).where(and(...conditions)).orderBy(cashRegisters.name)
    : db.select().from(cashRegisters).orderBy(cashRegisters.name));

  // If no registers exist and branchId is provided, seed a default one
  if (registers.length === 0 && branchId) {
    const defaultReg = await createCashRegister({
      branchId,
      name: 'Caja Principal',
    });
    registers.push(defaultReg);
  }

  // Una caja puede tener VARIOS turnos abiertos a la vez (de distintos cajeros).
  const result = [];
  for (const reg of registers) {
    const openSessions = await db
      .select()
      .from(cashSessions)
      .where(and(
        eq(cashSessions.registerId, reg.id),
        eq(cashSessions.status, 'open')
      ))
      .orderBy(desc(cashSessions.openedAt));
    result.push({
      ...reg,
      openSessions,
    });
  }

  return result;
}

export async function createCashRegister(data: {
  branchId: number; name: string; userId?: number | null; exchangeRate?: number;
}) {
  const db = getTenantDb();
  const [reg] = await db
    .insert(cashRegisters)
    .values({
      branchId: data.branchId,
      name: data.name,
      userId: data.userId ?? null, // dueño/creador de la caja
      exchangeRate: data.exchangeRate != null && data.exchangeRate > 0 ? data.exchangeRate.toFixed(4) : '1',
      isActive: true,
    })
    .returning();
  return reg;
}

export async function updateCashRegister(
  id: number,
  data: { name?: string; isActive?: boolean; userId?: number | null; exchangeRate?: number }
) {
  const db = getTenantDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  if (data.userId !== undefined) patch.userId = data.userId;
  if (data.exchangeRate !== undefined && data.exchangeRate > 0) patch.exchangeRate = data.exchangeRate.toFixed(4);

  const [reg] = await db
    .update(cashRegisters)
    .set(patch)
    .where(eq(cashRegisters.id, id))
    .returning();
  return reg;
}

// Cerrar la caja (B3): solo si NO tiene turnos abiertos. Desactiva la caja.
export async function closeCashRegister(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const [reg] = await db.select().from(cashRegisters).where(eq(cashRegisters.id, id)).limit(1);
  if (!reg) throw new Error('Caja no encontrada');

  const open = await db
    .select({ code: cashSessions.code })
    .from(cashSessions)
    .where(and(eq(cashSessions.registerId, id), eq(cashSessions.status, 'open')));

  if (open.length > 0) {
    throw new Error(
      `No puedes cerrar la caja: tiene ${open.length} turno(s) abierto(s) (${open.map((o) => o.code).join(', ')}). Ciérralos primero.`,
    );
  }

  const [updated] = await db
    .update(cashRegisters)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(cashRegisters.id, id))
    .returning();

  await writeAuditLog({
    tableName: 'cash_registers',
    operation: 'UPDATE',
    recordId: id,
    beforeData: reg,
    afterData: updated,
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'caja',
    description: `Caja cerrada (desactivada): ${reg.name}`,
  });

  return updated;
}

// ─── queries ──────────────────────────────────────────────────────────────────

export async function listCashSessions(filters?: { registerId?: number; status?: string; from?: string; to?: string; userId?: number }) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.registerId) conditions.push(eq(cashSessions.registerId, filters.registerId));
  if (filters?.status) conditions.push(eq(cashSessions.status, filters.status as 'open' | 'closed'));
  if (filters?.from) conditions.push(gte(cashSessions.openedAt, new Date(filters.from)));
  if (filters?.to) conditions.push(lte(cashSessions.openedAt, new Date(filters.to + 'T23:59:59')));
  if (filters?.userId) conditions.push(eq(cashSessions.userId, filters.userId));

  const q = db.select().from(cashSessions).orderBy(desc(cashSessions.openedAt));
  return conditions.length ? q.where(and(...conditions)) : q;
}

export async function getCurrentCashSession(registerId?: number) {
  const db = getTenantDb();
  if (!registerId) return null;
  const [session] = await db
    .select()
    .from(cashSessions)
    .where(and(
      eq(cashSessions.registerId, registerId),
      eq(cashSessions.status, 'open')
    ))
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);
  return session ?? null;
}

export async function getCashSessionById(id: number) {
  const db = getTenantDb();
  const [session] = await db.select().from(cashSessions).where(eq(cashSessions.id, id));
  if (!session) return null;

  // Movimientos RECIBIDOS en esta sesión (cajero: ingresos cobrados)
  const rows = await db
    .select({
      movement: cashMovements,
      orderTotal: orders.total,
    })
    .from(cashMovements)
    .leftJoin(orders, eq(cashMovements.orderId, orders.id))
    .where(eq(cashMovements.sessionId, id))
    .orderBy(desc(cashMovements.createdAt));

  // Libro de caja (ledger): se usan los valores CONGELADOS del movimiento
  // (monto/método tal como se registraron al cobrar). orderTotal va solo como
  // referencia informativa; cambios posteriores al pedido NO alteran el arqueo.
  const movements = rows.map((r) => ({ ...r.movement, orderTotal: r.orderTotal }));

  // Ventas GENERADAS por esta sesión: ingresos de órdenes donde el usuario de
  // esta sesión fue quien creó el pedido (orders.cashSessionId = id).
  // Permite ver cuánto vendió el mozo aunque el cobro lo haya procesado el cajero.
  const generatedRows = await db
    .select({
      movement: cashMovements,
      orderTotal: orders.total,
    })
    .from(orders)
    .innerJoin(
      cashMovements,
      and(eq(cashMovements.orderId, orders.id), eq(cashMovements.movementType, 'income')),
    )
    .where(eq(orders.cashSessionId, id))
    .orderBy(desc(cashMovements.createdAt));

  const generatedMovements = generatedRows.map((r) => ({ ...r.movement, orderTotal: r.orderTotal }));

  // Desglose de INGRESOS por método de pago (valores congelados)
  const totalsByMethod: Record<string, number> = {};
  for (const m of movements) {
    if (m.movementType === 'income' || m.movementType === 'deposit') {
      const key = (m.paymentMethod ?? '').trim() || 'efectivo';
      totalsByMethod[key] = round2ToNum((totalsByMethod[key] ?? 0) + toNum(m.amount));
    }
  }

  return { ...session, movements, generatedMovements, totalsByMethod };
}

function round2ToNum(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── mutations ────────────────────────────────────────────────────────────────

export async function openCashSession(
  data: {
    registerId: number;
    openingBalance: number;
    openingBalanceForeign?: number;
    exchangeRate?: number;
    sellExchangeRate?: number;
    hotelExchangeRate?: number;
    officialExchangeRate?: number;
    baseCurrency?: string;
    foreignCurrency?: string;
    // Solo quien tiene el permiso caja.configurar_tipo_cambio (el cajero real, quien
    // cobra y hace la conversión) puede/debe fijar el T/C. A un mozo u otro usuario
    // sin el permiso no se le pide ni se le exige — el turno abre con T/C=1.
    allowCustomRate?: boolean;
    userId?: number;
    notes?: string;
  },
  actor?: AuditActor
) {
  const db = getTenantDb();

  // Validate register exists and is active
  const [reg] = await db.select().from(cashRegisters).where(eq(cashRegisters.id, data.registerId)).limit(1);
  if (!reg) throw new Error('Caja no encontrada');
  if (!reg.isActive) throw new Error('La caja está inactiva');

  // Cajero del turno: el seleccionado al abrir; si no se envía, el que realiza la apertura.
  const cashierId = data.userId ?? actor?.userId ?? null;
  if (!cashierId) throw new Error('Debes seleccionar el cajero del turno');

  // Regla A: un usuario no puede tener 2 turnos abiertos a la vez (la caja sí puede
  // tener varios turnos abiertos, pero de distintos cajeros).
  const userOpen = await getActiveSessionForUser(cashierId);
  if (userOpen) throw new Error(`El cajero ya tiene un turno abierto: ${userOpen.code}. Debe cerrarlo antes de abrir otro.`);

  let openedByName = actor?.userName ?? 'sistema';
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, cashierId)).limit(1);
  if (u?.name) openedByName = u.name;

  // Si la sede tiene moneda extranjera habilitada, el tipo de cambio es obligatorio
  // para abrir turno — pero SOLO para quien tiene el permiso caja.configurar_tipo_cambio
  // (el cajero real). Un mozo u otro usuario sin el permiso no cobra ni convierte, así
  // que no se le pide: el turno abre igual, con T/C=1.
  const [branch] = await db.select({ foreignCurrency: branches.foreignCurrency }).from(branches).where(eq(branches.id, reg.branchId)).limit(1);
  const requiresExchangeRate = !!branch?.foreignCurrency && !!data.allowCustomRate;

  if (requiresExchangeRate && !(data.exchangeRate != null && data.exchangeRate > 0)) {
    throw new Error(`Esta sucursal opera con moneda extranjera (${branch!.foreignCurrency}); debes ingresar el tipo de cambio para abrir el turno.`);
  }

  const rate = data.allowCustomRate && data.exchangeRate != null && data.exchangeRate > 0
    ? data.exchangeRate.toFixed(4)
    : '1';

  if (data.allowCustomRate && data.exchangeRate != null && data.exchangeRate > 0) {
    const officialRate = data.officialExchangeRate != null && data.officialExchangeRate > 0
      ? data.officialExchangeRate.toFixed(4)
      : rate;
    const sellRate = data.sellExchangeRate != null && data.sellExchangeRate > 0
      ? data.sellExchangeRate.toFixed(4)
      : 0;
    const hotelRate = data.hotelExchangeRate != null && data.hotelExchangeRate > 0
      ? data.hotelExchangeRate.toFixed(4)
      : 0;
    await createExchangeRate({
      dateExchangeRate: new Date().toISOString(),
      currencyFrom: data.baseCurrency || 'PEN',
      currencyTo: data.foreignCurrency || 'USD',
      buyExchangeRate: rate,
      sellExchangeRate: sellRate,
      hotelExchangeRate: hotelRate,
      officialExchangeRate: officialRate,
      branchId: reg.branchId,
      userId: cashierId,
    });
  }

  const year = new Date().getFullYear();

  return db.transaction(async (tx) => {
    const { sequence, code } = await nextSessionCorrelative(tx, reg.branchId, year);

    const [session] = await tx
      .insert(cashSessions)
      .values({
        code,
        year,
        sequence,
        registerId: data.registerId,
        branchId: reg.branchId,
        userId: cashierId,
        openedBy: openedByName,
        openingBalance: round2(data.openingBalance),
        openingBalanceForeign: data.openingBalanceForeign ? round2(data.openingBalanceForeign) : '0.00',
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
      userId: actor?.userId,
      userName: actor?.userName,
      module: 'caja',
      description: `Turno de caja abierto en "${reg.name}": ${code} (cajero: ${openedByName}) con saldo inicial S/ ${round2(data.openingBalance)}`,
    });

    return session;
  });
}

// Devuelve la sesión/turno de caja ABIERTO asociado a un usuario (cajero), o null.
// Se usa para bloquear la creación de pedidos si el usuario no tiene caja aperturada.
export async function getActiveSessionForUser(userId?: number) {
  const db = getTenantDb();
  if (!userId) return null;
  const [session] = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.userId, userId), eq(cashSessions.status, 'open')))
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);
  return session ?? null;
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

  // Retiros/depósitos son efectivo por naturaleza; el resto según el método configurado.
  const isCash = (data.movementType === 'withdrawal' || data.movementType === 'deposit')
    ? true
    : await resolveIsCash(data.paymentMethod);

  return db.transaction(async (tx) => {
    const [movement] = await tx
      .insert(cashMovements)
      .values({
        sessionId,
        movementType: data.movementType,
        concept: data.concept,
        amount: round2(data.amount),
        paymentMethod: data.paymentMethod,
        isCash,
        orderId: data.orderId ?? null,
        reference: data.reference,
        createdBy: actor?.userName ?? 'sistema',
      })
      .returning();

    // Recalcular acumulados del turno (efectivo-only en expectedBalance)
    const updated = await recomputeSessionTotals(tx, sessionId);

    await writeAuditLog({
      tableName: 'cash_movements',
      operation: 'INSERT',
      recordId: movement.id,
      afterData: movement,
      userId: actor?.userId,
      userName: actor?.userName,
      module: 'caja',
      description: `Movimiento de caja [${data.movementType}]: ${data.concept} — S/ ${round2(data.amount)}`,
    });

    return { movement, session: updated };
  });
}

// Crea automáticamente el INGRESO de caja al cobrar un pedido.
// Se atribuye al turno del CAJERO que cobró (orders.collectedSessionId), NO al del mozo.
// Idempotente: si ya existe un ingreso para ese pedido, no duplica.
// No lanza error: si el turno no existe/está cerrado, devuelve created=false (el pago no se bloquea).
export async function recordOrderSaleIncome(
  orderId: string,
  data: { amount: number; paymentMethod?: string | null },
  actor?: AuditActor,
): Promise<{ created: boolean; reason?: string }> {
  const db = getTenantDb();

  const [existing] = await db
    .select({ id: cashMovements.id })
    .from(cashMovements)
    .where(and(eq(cashMovements.orderId, orderId), eq(cashMovements.movementType, 'income'), isNull(cashMovements.splitId)))
    .limit(1);
  if (existing) return { created: false, reason: 'already_recorded' };

  // Atribución al turno del cajero que cobró (collectedSessionId), no al del mozo creador.
  const [order] = await db
    .select({ collectedSessionId: orders.collectedSessionId, paymentMethodId: orders.paymentMethodId })
    .from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order?.collectedSessionId) return { created: false, reason: 'no_session_linked' };
  const [session] = await db.select().from(cashSessions).where(eq(cashSessions.id, order.collectedSessionId)).limit(1);
  if (!session) return { created: false, reason: 'session_not_found' };
  if (session.status !== 'open') return { created: false, reason: 'session_closed' };

  // isCash por id del método del pedido (estable); fallback al nombre.
  const isCash = await resolveIsCashByMethod(order.paymentMethodId, data.paymentMethod);

  await db.transaction(async (tx) => {
    const [movement] = await tx
      .insert(cashMovements)
      .values({
        sessionId: session.id,
        movementType: 'income',
        concept: `Venta pedido ${orderId}`,
        amount: round2(data.amount),
        paymentMethod: data.paymentMethod ?? null,
        isCash,
        orderId,
        createdBy: actor?.userName ?? 'sistema',
      })
      .returning();

    await recomputeSessionTotals(tx, session.id);

    await writeAuditLog({
      tableName: 'cash_movements',
      operation: 'INSERT',
      recordId: movement.id,
      afterData: movement,
      userId: actor?.userId,
      userName: actor?.userName,
      module: 'caja',
      description: `Ingreso por venta ${orderId} (${data.paymentMethod ?? 'efectivo'}) — S/ ${round2(data.amount)}`,
    });
  });

  return { created: true };
}

// Revierte TODOS los ingresos de un pedido anulado/cancelado (nivel pedido y por split).
// Inserta un egreso de reverso por cada ingreso sin reverso, en su turno si sigue abierto.
// Idempotente: no revierte dos veces (se identifica por splitId).
export async function reverseOrderSaleMovement(
  orderId: string,
  actor?: AuditActor,
): Promise<{ reversed: boolean; reason?: string }> {
  const db = getTenantDb();

  const incomes = await db
    .select()
    .from(cashMovements)
    .where(and(eq(cashMovements.orderId, orderId), eq(cashMovements.movementType, 'income')));
  if (incomes.length === 0) return { reversed: false, reason: 'no_income' };

  const reverses = await db
    .select({ splitId: cashMovements.splitId })
    .from(cashMovements)
    .where(and(
      eq(cashMovements.orderId, orderId),
      eq(cashMovements.movementType, 'expense'),
      eq(cashMovements.reference, 'reverso'),
    ));
  const reversedKeys = new Set(reverses.map((r) => r.splitId ?? 'order'));

  const sessionsToRecompute = new Set<number>();
  let any = false;

  await db.transaction(async (tx) => {
    for (const income of incomes) {
      const key = income.splitId ?? 'order';
      if (reversedKeys.has(key)) continue;
      const [session] = await tx.select().from(cashSessions).where(eq(cashSessions.id, income.sessionId));
      if (!session || session.status !== 'open') continue; // turno cerrado → no se puede revertir aquí
      const [movement] = await tx
        .insert(cashMovements)
        .values({
          sessionId: income.sessionId,
          movementType: 'expense',
          concept: `Reverso venta ${orderId} (anulada)`,
          amount: income.amount,
          paymentMethod: income.paymentMethod,
          isCash: income.isCash,
          orderId,
          splitId: income.splitId,
          reference: 'reverso',
          createdBy: actor?.userName ?? 'sistema',
        })
        .returning();
      sessionsToRecompute.add(income.sessionId);
      any = true;
      await writeAuditLog({
        tableName: 'cash_movements',
        operation: 'INSERT',
        recordId: movement.id,
        afterData: movement,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'caja',
        description: `Reverso de venta ${orderId}${income.splitId ? ` (cuenta ${income.splitId})` : ''} — S/ ${income.amount}`,
      });
    }
    for (const sid of sessionsToRecompute) await recomputeSessionTotals(tx, sid);
  });

  return { reversed: any, reason: any ? undefined : 'nothing_to_reverse' };
}

// Registra el ingreso de UNA cuenta/split al marcarse pagada (#5: un movimiento por split).
// Idempotente por splitId. Atribuye al turno del cajero que cobró (collectedSessionId explícito),
// con fallback a order.collectedSessionId si no se pasa.
export async function recordSplitSaleIncome(
  splitId: number,
  actor?: AuditActor,
  collectedSessionId?: number,
): Promise<{ created: boolean; reason?: string }> {
  const db = getTenantDb();

  const [existing] = await db
    .select({ id: cashMovements.id })
    .from(cashMovements)
    .where(and(eq(cashMovements.splitId, splitId), eq(cashMovements.movementType, 'income')))
    .limit(1);
  if (existing) return { created: false, reason: 'already_recorded' };

  const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, splitId)).limit(1);
  if (!split) return { created: false, reason: 'split_not_found' };

  const [order] = await db.select({ collectedSessionId: orders.collectedSessionId }).from(orders).where(eq(orders.id, split.orderId)).limit(1);
  const targetSessionId = collectedSessionId ?? order?.collectedSessionId;
  if (!targetSessionId) return { created: false, reason: 'no_session_linked' };
  const [session] = await db.select().from(cashSessions).where(eq(cashSessions.id, targetSessionId)).limit(1);
  if (!session) return { created: false, reason: 'session_not_found' };
  if (session.status !== 'open') return { created: false, reason: 'session_closed' };

  const amount = toNum(split.total);
  const isCash = await resolveIsCashByMethod(split.paymentMethodId, split.paymentMethod);

  await db.transaction(async (tx) => {
    const [movement] = await tx
      .insert(cashMovements)
      .values({
        sessionId: session.id,
        movementType: 'income',
        concept: `Venta pedido ${split.orderId} · ${split.label ?? 'cuenta'}`,
        amount: round2(amount),
        paymentMethod: split.paymentMethod ?? null,
        isCash,
        orderId: split.orderId,
        splitId,
        createdBy: actor?.userName ?? 'sistema',
      })
      .returning();
    await recomputeSessionTotals(tx, session.id);
    await writeAuditLog({
      tableName: 'cash_movements',
      operation: 'INSERT',
      recordId: movement.id,
      afterData: movement,
      userId: actor?.userId,
      userName: actor?.userName,
      module: 'caja',
      description: `Ingreso por venta ${split.orderId} (cuenta ${split.label ?? splitId}, ${split.paymentMethod ?? 'efectivo'}) — S/ ${round2(amount)}`,
    });
  });

  return { created: true };
}

// Revierte el ingreso de UNA cuenta/split (cuando se desmarca el pago).
export async function reverseSplitSaleIncome(
  splitId: number,
  actor?: AuditActor,
): Promise<{ reversed: boolean; reason?: string }> {
  const db = getTenantDb();

  const [income] = await db
    .select()
    .from(cashMovements)
    .where(and(eq(cashMovements.splitId, splitId), eq(cashMovements.movementType, 'income')))
    .limit(1);
  if (!income) return { reversed: false, reason: 'no_income' };

  const [already] = await db
    .select({ id: cashMovements.id })
    .from(cashMovements)
    .where(and(eq(cashMovements.splitId, splitId), eq(cashMovements.movementType, 'expense'), eq(cashMovements.reference, 'reverso')))
    .limit(1);
  if (already) return { reversed: false, reason: 'already_reversed' };

  const [session] = await db.select().from(cashSessions).where(eq(cashSessions.id, income.sessionId));
  if (!session || session.status !== 'open') return { reversed: false, reason: 'session_closed' };

  await db.transaction(async (tx) => {
    const [movement] = await tx
      .insert(cashMovements)
      .values({
        sessionId: income.sessionId,
        movementType: 'expense',
        concept: `Reverso cuenta ${income.orderId ?? ''} (pago revertido)`,
        amount: income.amount,
        paymentMethod: income.paymentMethod,
        isCash: income.isCash,
        orderId: income.orderId,
        splitId,
        reference: 'reverso',
        createdBy: actor?.userName ?? 'sistema',
      })
      .returning();
    await recomputeSessionTotals(tx, income.sessionId);
    await writeAuditLog({
      tableName: 'cash_movements',
      operation: 'INSERT',
      recordId: movement.id,
      afterData: movement,
      userId: actor?.userId,
      userName: actor?.userName,
      module: 'caja',
      description: `Reverso de cuenta ${splitId} — S/ ${income.amount}`,
    });
  });

  return { reversed: true };
}

// #6 Devolución/reembolso de un pedido: egreso ligado al pedido en el turno abierto
// del que registra la devolución (de ahí sale físicamente el dinero). Monto total o parcial.
export async function refundOrder(
  orderId: string,
  data: { amount: number; reason?: string },
  actor?: AuditActor,
) {
  const db = getTenantDb();
  const [order] = await db
    .select({ paymentMethodId: orders.paymentMethodId, paymentMethod: orders.paymentMethod, total: orders.total })
    .from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error('Pedido no encontrado');

  const amount = toNum(data.amount);
  if (amount <= 0) throw new Error('Monto de devolución inválido');
  if (amount > toNum(order.total)) throw new Error('La devolución no puede superar el total del pedido');

  const session = await getActiveSessionForUser(actor?.userId);
  if (!session) throw new Error('Necesitas un turno de caja abierto para registrar la devolución');

  const isCash = await resolveIsCashByMethod(order.paymentMethodId, order.paymentMethod);

  return db.transaction(async (tx) => {
    const [movement] = await tx
      .insert(cashMovements)
      .values({
        sessionId: session.id,
        movementType: 'expense',
        concept: `Devolución pedido ${orderId}${data.reason ? ` — ${data.reason}` : ''}`,
        amount: round2(amount),
        paymentMethod: order.paymentMethod,
        isCash,
        orderId,
        reference: 'devolucion',
        createdBy: actor?.userName ?? 'sistema',
      })
      .returning();
    const updated = await recomputeSessionTotals(tx, session.id);
    await writeAuditLog({
      tableName: 'cash_movements',
      operation: 'INSERT',
      recordId: movement.id,
      afterData: movement,
      userId: actor?.userId,
      userName: actor?.userName,
      module: 'caja',
      description: `Devolución pedido ${orderId} — S/ ${round2(amount)}`,
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
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'caja',
    description: `Sesión de caja cerrada: ${session.code}. Diferencia: S/ ${round2(difference)}`,
  });

  return closed;
}

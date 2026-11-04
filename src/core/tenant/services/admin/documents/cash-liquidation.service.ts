import {
  cashSessions, cashMovements, cashRegisters, branches, orders, billingDocuments, paymentMethods,
  cashSessionParticipants, cashRegisterDocumentSeries, orderPayments, users as usersTable,
} from '../../../../../db/tenant/schema';
import { eq, and, ne, inArray, asc, gte, lte } from 'drizzle-orm';
import { getTenantDb } from '../../../../../utils/tenant-context';

// ─── Liquidación de cajero (por turno) ──────────────────────────────────────
// Solo lectura. Arma, a partir del libro de caja (cash_movements, valores congelados al cobrar)
// y de los comprobantes, el detalle que se imprime al cerrar el turno: documentos generados,
// cobros por medio de pago (con propina, retención y N.º de operación), egresos, descuentos,
// pedidos de otro turno cobrados aquí, correlativos y el resumen.
//
// Un comprobante pertenece al turno si su pedido (o cuenta dividida) se cobró en el turno;
// si no tiene cobro (pago pendiente), si el pedido se generó en el turno. Las notas de crédito
// van al turno en que se emitieron: serie de la caja del turno y hora dentro del turno.
//
// Montos: cash_movements.amount es lo que pagó el cliente INCLUIDA la propina (tip_amount);
// la retención se calcula sobre la venta. Usuario de cada cobro: quien registró el pago
// (order_payments.created_by_id); cash_movements.created_by suele quedar como 'sistema'.

const toNum = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};
const round2 = (value: number) => Math.round(value * 100) / 100;

type Movement = typeof cashMovements.$inferSelect;
type Document = typeof billingDocuments.$inferSelect;

export interface LiquidationPaymentRow {
  movementId: number;
  documentNumber: string | null;
  orderTrackingCode: string | null;
  saleTotal: number | null;
  paidAt: Date | null;
  /** Cobrado al cliente, propina incluida */
  amount: number;
  tip: number;
  retention: number;
  reference: string | null;
  user: string | null;
}

export interface LiquidationMethodGroup {
  method: string;
  isCash: boolean;
  count: number;
  /** Cobrado, propina incluida */
  amount: number;
  tips: number;
  retention: number;
  /** Cobrado − retención */
  net: number;
  rows: LiquidationPaymentRow[];
}

const docKey = (orderId: string, splitId: number | null) => `${orderId}:${splitId ?? ''}`;

/**
 * Liquidación del turno `sessionId`. `user` (opcional) filtra por el usuario que registró
 * cada operación (nombre tal como se guarda en created_by); los totales del arqueo
 * (fondo, esperado, declarado) son siempre los del turno completo.
 */
export async function getCashSessionLiquidation(sessionId: number, user?: string | null) {
  const db = getTenantDb();

  const [row] = await db
    .select({ session: cashSessions, registerName: cashRegisters.name, branchName: branches.name })
    .from(cashSessions)
    .leftJoin(cashRegisters, eq(cashSessions.registerId, cashRegisters.id))
    .leftJoin(branches, eq(cashSessions.branchId, branches.id))
    .where(eq(cashSessions.id, sessionId))
    .limit(1);
  if (!row) return null;
  const session = row.session;
  const participants = await db
    .select({ userId: cashSessionParticipants.userId, name: usersTable.name, joinedAt: cashSessionParticipants.joinedAt })
    .from(cashSessionParticipants)
    .leftJoin(usersTable, eq(cashSessionParticipants.userId, usersTable.id))
    .where(eq(cashSessionParticipants.sessionId, sessionId))
    .orderBy(asc(cashSessionParticipants.joinedAt));

  // Libro de caja del turno
  const movements = await db
    .select({ movement: cashMovements, trackingCode: orders.trackingCode, orderTotal: orders.total, orderSessionId: orders.cashSessionId })
    .from(cashMovements)
    .leftJoin(orders, eq(cashMovements.orderId, orders.id))
    .where(eq(cashMovements.sessionId, sessionId))
    .orderBy(asc(cashMovements.createdAt), asc(cashMovements.id));

  // Usuarios que registraron operaciones (para el filtro del panel)
  const users = new Set<string>();

  // Pedidos cobrados en el turno + pedidos generados en el turno (para pagos pendientes)
  const paidOrderIds = [...new Set(movements.map((m) => m.movement.orderId).filter((id): id is string => !!id))];
  const generatedOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.cashSessionId, sessionId));
  const orderIds = [...new Set([...paidOrderIds, ...generatedOrders.map((o) => o.id)])];

  const docs: (Document & { trackingCode: string | null; orderSessionId: number | null })[] = orderIds.length
    ? await db
      .select({ doc: billingDocuments, trackingCode: orders.trackingCode, orderSessionId: orders.cashSessionId })
      .from(billingDocuments)
      .innerJoin(orders, eq(billingDocuments.orderId, orders.id))
      .where(and(inArray(billingDocuments.orderId, orderIds), ne(billingDocuments.documentType, 'nota_de_credito')))
      .orderBy(asc(billingDocuments.series), asc(billingDocuments.sequential))
      .then((rows) => rows.map((r) => ({ ...r.doc, trackingCode: r.trackingCode, orderSessionId: r.orderSessionId })))
    : [];

  // Notas de crédito emitidas durante el turno con una serie de su caja
  const creditNoteDocs: typeof docs = session.registerId != null && session.openedAt
    ? await db
      .select({ doc: billingDocuments, trackingCode: orders.trackingCode, orderSessionId: orders.cashSessionId })
      .from(billingDocuments)
      .innerJoin(cashRegisterDocumentSeries, eq(billingDocuments.seriesId, cashRegisterDocumentSeries.id))
      .leftJoin(orders, eq(billingDocuments.orderId, orders.id))
      .where(and(
        eq(billingDocuments.documentType, 'nota_de_credito'),
        eq(cashRegisterDocumentSeries.registerId, session.registerId),
        gte(billingDocuments.issuedAt, session.openedAt),
        lte(billingDocuments.issuedAt, session.closedAt ?? new Date()),
      ))
      .orderBy(asc(billingDocuments.series), asc(billingDocuments.sequential))
      .then((rows) => rows.map((r) => ({ ...r.doc, trackingCode: r.trackingCode, orderSessionId: r.orderSessionId })))
    : [];

  // Comprobante de cada cobro (pedido o cuenta dividida); el primero vigente gana
  const docByKey = new Map<string, Document>();
  for (const d of docs) {
    const key = docKey(d.orderId, d.splitId);
    const prev = docByKey.get(key);
    if (!prev || (prev.status === 'voided' && d.status !== 'voided')) docByKey.set(key, d);
  }
  const docFor = (orderId: string | null, splitId: number | null) => {
    if (!orderId) return null;
    return docByKey.get(docKey(orderId, splitId)) ?? docByKey.get(docKey(orderId, null)) ?? null;
  };

  // Quién registró cada pago (por pedido / cuenta dividida)
  const payers = orderIds.length
    ? await db
      .select({ orderId: orderPayments.orderId, splitId: orderPayments.splitId, name: usersTable.name })
      .from(orderPayments)
      .innerJoin(usersTable, eq(orderPayments.createdById, usersTable.id))
      .where(inArray(orderPayments.orderId, orderIds))
      .orderBy(asc(orderPayments.id))
    : [];
  const payerByKey = new Map<string, string>();
  for (const p of payers) {
    if (!p.name) continue;
    payerByKey.set(docKey(p.orderId, p.splitId), p.name);
    if (!payerByKey.has(docKey(p.orderId, null))) payerByKey.set(docKey(p.orderId, null), p.name);
  }
  const userOf = (orderId: string | null, splitId: number | null, fallback: string | null) => {
    const known = orderId ? payerByKey.get(docKey(orderId, splitId)) ?? payerByKey.get(docKey(orderId, null)) : undefined;
    if (known) return known;
    return fallback && fallback !== 'sistema' && fallback !== 'system' ? fallback : null;
  };

  // ¿El documento pertenece a este turno? Cobrado aquí, o sin cobro y generado aquí.
  const paidKeys = new Set(movements
    .filter((m) => m.movement.movementType === 'income' && m.movement.orderId)
    .map((m) => docKey(m.movement.orderId!, m.movement.splitId)));
  const paidOrders = new Set(paidOrderIds);
  const belongs = (d: (typeof docs)[number]) => {
    if (paidKeys.has(docKey(d.orderId, d.splitId)) || (d.splitId == null && paidOrders.has(d.orderId))) return true;
    return d.orderSessionId === sessionId && d.paymentPending;
  };

  // Medio de pago → efectivo (congelado en el movimiento; si es antiguo, del catálogo o por nombre)
  const methods = await db.select({ name: paymentMethods.name, isCash: paymentMethods.isCash }).from(paymentMethods);
  const cashByName = new Map(methods.map((m) => [m.name.trim().toLowerCase(), m.isCash]));
  const isCashMovement = (m: Movement) => {
    if (m.isCash != null) return m.isCash;
    const name = (m.paymentMethod ?? '').trim().toLowerCase();
    return cashByName.get(name) ?? (name === '' || name === 'efectivo' || name === 'cash');
  };

  const matchesUser = (name: string | null) => !user || (name ?? '') === user;

  // ── 00 Documentos generados ──
  const paidAtByKey = new Map<string, { at: Date | null; amount: number }>();
  for (const m of movements) {
    if (m.movement.movementType !== 'income' || !m.movement.orderId) continue;
    const key = docKey(m.movement.orderId, m.movement.splitId);
    const prev = paidAtByKey.get(key);
    paidAtByKey.set(key, { at: prev?.at ?? m.movement.createdAt, amount: round2((prev?.amount ?? 0) + toNum(m.movement.amount)) });
  }
  const sessionDocs = [...docs.filter(belongs), ...creditNoteDocs]
    .map((d) => ({ ...d, user: d.documentType === 'nota_de_credito' ? userOf(null, null, d.createdBy) : userOf(d.orderId, d.splitId, d.createdBy) }));
  for (const d of sessionDocs) if (d.user) users.add(d.user);

  const documentRows = sessionDocs
    .filter((d) => matchesUser(d.user))
    .map((d) => {
      const paid = paidAtByKey.get(docKey(d.orderId, d.splitId)) ?? (d.splitId == null ? null : paidAtByKey.get(docKey(d.orderId, null)));
      return {
        id: d.id,
        documentType: d.documentType,
        documentNumber: d.documentNumber,
        issuedAt: d.issuedAt,
        total: toNum(d.total),
        subtotal: toNum(d.subtotal),
        taxAmount: toNum(d.taxAmount),
        paidAt: paid?.at ?? null,
        paidAmount: paid?.amount ?? null,
        user: d.user,
        status: d.status,
        paymentPending: d.paymentPending && !d.paymentCollectedAt,
        orderTrackingCode: d.trackingCode,
      };
    });
  const validDocs = documentRows.filter((d) => d.status !== 'voided' && d.documentType !== 'nota_de_credito');
  const creditNotes = documentRows.filter((d) => d.status !== 'voided' && d.documentType === 'nota_de_credito');

  // ── 01 Efectivo / 02 Otros medios de pago ──
  const groups = new Map<string, LiquidationMethodGroup>();
  for (const { movement: m, trackingCode, orderTotal } of movements) {
    if (m.movementType !== 'income' || !m.orderId) continue;
    const payer = userOf(m.orderId, m.splitId, m.createdBy);
    if (payer) users.add(payer);
    if (!matchesUser(payer)) continue;
    const method = (m.paymentMethod ?? '').trim() || 'Efectivo';
    const cash = isCashMovement(m);
    const key = `${cash ? 1 : 0}:${method.toLowerCase()}`;
    const group = groups.get(key) ?? { method, isCash: cash, count: 0, amount: 0, tips: 0, retention: 0, net: 0, rows: [] };
    const doc = docFor(m.orderId, m.splitId);
    const amount = toNum(m.amount);
    const tip = toNum(m.tipAmount);
    const retention = toNum(m.retentionAmount);
    group.rows.push({
      movementId: m.id,
      documentNumber: doc?.documentNumber ?? null,
      orderTrackingCode: trackingCode,
      saleTotal: doc ? toNum(doc.total) : orderTotal != null ? toNum(orderTotal) : null,
      paidAt: m.createdAt,
      amount,
      tip,
      retention,
      reference: m.reference,
      user: payer,
    });
    group.count += 1;
    group.amount = round2(group.amount + amount);
    group.tips = round2(group.tips + tip);
    group.retention = round2(group.retention + retention);
    group.net = round2(group.amount - group.retention);
    groups.set(key, group);
  }
  const byMethod = [...groups.values()].sort((a, b) => Number(b.isCash) - Number(a.isCash) || b.amount - a.amount);

  // ── Egresos e ingresos manuales (recibos) ──
  const manual = movements
    .filter(({ movement: m }) => !m.orderId || m.movementType !== 'income')
    .filter(({ movement: m }) => {
      const who = userOf(null, null, m.createdBy);
      if (who) users.add(who);
      return matchesUser(who);
    })
    .map(({ movement: m, trackingCode }) => ({
      orderTrackingCode: trackingCode,
      id: m.id,
      type: m.movementType,
      concept: m.concept,
      amount: toNum(m.amount),
      paymentMethod: m.paymentMethod,
      reference: m.reference,
      createdAt: m.createdAt,
      user: userOf(null, null, m.createdBy),
    }));
  const expenses = manual.filter((m) => m.type === 'expense' || m.type === 'withdrawal');
  const incomes = manual.filter((m) => m.type === 'income' || m.type === 'deposit');

  // ── Descuentos (pedidos con descuento cobrados o generados en el turno) ──
  const discountRows = orderIds.length
    ? await db
      .select({
        trackingCode: orders.trackingCode,
        amount: orders.discountAmount,
        motivo: orders.discountMotivo,
        total: orders.total,
        at: orders.discountAt,
      })
      .from(orders)
      .where(inArray(orders.id, orderIds))
    : [];
  const discounts = discountRows
    .filter((d) => toNum(d.amount) > 0)
    .map((d) => ({ orderTrackingCode: d.trackingCode, amount: toNum(d.amount), reason: d.motivo, orderTotal: toNum(d.total), at: d.at }));

  // ── Pedidos generados en otro turno y cobrados en este ──
  const foreignOrderIds = new Set(movements
    .filter((m) => m.movement.movementType === 'income' && m.movement.orderId && m.orderSessionId != null && m.orderSessionId !== sessionId)
    .map((m) => m.movement.orderId!));
  const foreignSessionIds = [...new Set(movements.filter((m) => m.movement.orderId && foreignOrderIds.has(m.movement.orderId)).map((m) => m.orderSessionId!))];
  const foreignSessions = foreignSessionIds.length
    ? await db.select({ id: cashSessions.id, code: cashSessions.code }).from(cashSessions).where(inArray(cashSessions.id, foreignSessionIds))
    : [];
  const codeBySession = new Map(foreignSessions.map((s) => [s.id, s.code]));
  const otherShiftOrders = [...foreignOrderIds].map((orderId) => {
    const m = movements.find((x) => x.movement.orderId === orderId)!;
    const doc = docFor(orderId, null);
    return {
      orderTrackingCode: m.trackingCode,
      generatedInSession: m.orderSessionId != null ? codeBySession.get(m.orderSessionId) ?? null : null,
      documentNumber: doc?.documentNumber ?? null,
      total: m.orderTotal != null ? toNum(m.orderTotal) : 0,
    };
  });

  // ── Correlativos por serie ──
  const bySeries = new Map<string, { documentType: string; series: string; from: string; to: string; fromSeq: number; toSeq: number; issued: number; voided: number }>();
  for (const d of sessionDocs) {
    const entry = bySeries.get(d.series) ?? {
      documentType: d.documentType, series: d.series, from: d.documentNumber, to: d.documentNumber,
      fromSeq: d.sequential, toSeq: d.sequential, issued: 0, voided: 0,
    };
    if (d.sequential < entry.fromSeq) { entry.fromSeq = d.sequential; entry.from = d.documentNumber; }
    if (d.sequential > entry.toSeq) { entry.toSeq = d.sequential; entry.to = d.documentNumber; }
    if (d.status === 'voided') entry.voided += 1; else entry.issued += 1;
    bySeries.set(d.series, entry);
  }
  const correlatives = [...bySeries.values()]
    .sort((a, b) => a.series.localeCompare(b.series))
    .map(({ fromSeq: _f, toSeq: _t, ...c }) => c);

  // ── Resumen ──
  const sum = <T>(rows: T[], pick: (r: T) => number) => round2(rows.reduce((acc, r) => acc + pick(r), 0));
  const cashGroups = byMethod.filter((g) => g.isCash);
  const otherGroups = byMethod.filter((g) => !g.isCash);
  const pending = validDocs.filter((d) => d.paymentPending);

  const summary = {
    collected: sum(byMethod, (g) => g.amount),
    collectedCash: sum(cashGroups, (g) => g.amount),
    collectedOther: sum(otherGroups, (g) => g.amount),
    tips: sum(byMethod, (g) => g.tips),
    // Cobrado sin propinas (lo que corresponde a ventas)
    collectedSales: round2(sum(byMethod, (g) => g.amount) - sum(byMethod, (g) => g.tips)),
    retention: sum(byMethod, (g) => g.retention),
    documents: {
      count: validDocs.length,
      voidedCount: documentRows.filter((d) => d.status === 'voided').length,
      subtotal: sum(validDocs, (d) => d.subtotal),
      taxAmount: sum(validDocs, (d) => d.taxAmount),
      total: sum(validDocs, (d) => d.total),
      average: validDocs.length ? round2(sum(validDocs, (d) => d.total) / validDocs.length) : 0,
    },
    creditNotes: { count: creditNotes.length, total: sum(creditNotes, (d) => d.total) },
    pendingPayment: { count: pending.length, total: sum(pending, (d) => d.total) },
    discounts: { count: discounts.length, total: sum(discounts, (d) => d.amount) },
    expenses: sum(expenses, (e) => e.amount),
    manualIncomes: sum(incomes, (e) => e.amount),
    // Arqueo del turno completo (no depende del filtro de usuario)
    openingBalance: toNum(session.openingBalance),
    expectedCash: toNum(session.expectedBalance),
    declaredCash: session.closingBalance != null ? toNum(session.closingBalance) : null,
    difference: session.difference != null ? toNum(session.difference) : null,
  };

  return {
    session: {
      id: session.id,
      code: session.code,
      status: session.status,
      branchId: session.branchId,
      branchName: row.branchName,
      registerName: row.registerName,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openedBy: session.openedBy,
      closedBy: session.closedBy,
      participants,
    },
    isFinal: session.status === 'closed',
    userFilter: user || null,
    users: [...users].sort((a, b) => a.localeCompare(b)),
    documents: documentRows,
    payments: { cash: cashGroups, other: otherGroups },
    expenses,
    incomes,
    discounts,
    otherShiftOrders,
    correlatives,
    summary,
  };
}

// ─── Liquidación por cajero ─────────────────────────────────────────────────
// Todo lo que cobró un cajero en los turnos de la sucursal que tuvieron actividad en el rango,
// sea cual sea la caja: un cajero puede estar en varios turnos (uno por caja). Por turno se
// reutiliza la liquidación del turno filtrada por ese usuario; el arqueo de efectivo es de cada
// turno (su caja) y no se reparte por cajero.

export async function getCashierLiquidation(params: { userId: number; branchId: number; from: Date; to: Date }) {
  const db = getTenantDb();
  const [user] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, params.userId)).limit(1);
  if (!user) return null;

  // Turnos de la sucursal abiertos durante el rango (los que siguen abiertos cuentan hasta hoy)
  const sessions = await db
    .select({ id: cashSessions.id, openedAt: cashSessions.openedAt, closedAt: cashSessions.closedAt })
    .from(cashSessions)
    .where(and(eq(cashSessions.branchId, params.branchId), lte(cashSessions.openedAt, params.to)))
    .orderBy(asc(cashSessions.openedAt));
  const inRange = sessions.filter((s) => !s.closedAt || s.closedAt >= params.from);

  const turnos: NonNullable<Awaited<ReturnType<typeof getCashSessionLiquidation>>>[] = [];
  for (const s of inRange) {
    const liq = await getCashSessionLiquidation(s.id, user.name);
    if (!liq) continue;
    const hasActivity = liq.documents.length > 0 || liq.summary.collected > 0 || liq.expenses.length > 0 || liq.incomes.length > 0;
    if (!hasActivity) continue;
    turnos.push(liq);
  }

  // Totales por medio de pago sumando los turnos
  const byMethod = new Map<string, { method: string; isCash: boolean; count: number; amount: number; tips: number; retention: number; net: number }>();
  for (const t of turnos) {
    for (const g of [...t.payments.cash, ...t.payments.other]) {
      const key = `${g.isCash ? 1 : 0}:${g.method.toLowerCase()}`;
      const acc = byMethod.get(key) ?? { method: g.method, isCash: g.isCash, count: 0, amount: 0, tips: 0, retention: 0, net: 0 };
      acc.count += g.count;
      acc.amount = round2(acc.amount + g.amount);
      acc.tips = round2(acc.tips + g.tips);
      acc.retention = round2(acc.retention + g.retention);
      acc.net = round2(acc.amount - acc.retention);
      byMethod.set(key, acc);
    }
  }
  const sumT = (pick: (t: (typeof turnos)[number]) => number) => round2(turnos.reduce((a, t) => a + pick(t), 0));

  return {
    user,
    branchId: params.branchId,
    from: params.from,
    to: params.to,
    turnos: turnos.map((t) => ({
      session: t.session,
      isFinal: t.isFinal,
      series: [...new Set(t.correlatives.map((c) => c.series))],
      documents: t.documents,
      payments: t.payments,
      expenses: t.expenses,
      incomes: t.incomes,
      summary: {
        documentsCount: t.summary.documents.count,
        documentsTotal: t.summary.documents.total,
        collected: t.summary.collected,
        collectedSales: t.summary.collectedSales,
        tips: t.summary.tips,
        retention: t.summary.retention,
        expenses: t.summary.expenses,
      },
    })),
    byMethod: [...byMethod.values()].sort((a, b) => Number(b.isCash) - Number(a.isCash) || b.amount - a.amount),
    totals: {
      turnos: turnos.length,
      documentsCount: sumT((t) => t.summary.documents.count),
      documentsTotal: sumT((t) => t.summary.documents.total),
      collected: sumT((t) => t.summary.collected),
      collectedSales: sumT((t) => t.summary.collectedSales),
      tips: sumT((t) => t.summary.tips),
      retention: sumT((t) => t.summary.retention),
      expenses: sumT((t) => t.summary.expenses),
    },
  };
}

import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  orders, orderItems, orderSplits, reasons, tables, billingDocuments, billingDocumentLines,
  cashRegisterDocumentSeries,
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundMoney } from '../warehouse/shared/numbers';
import { resolveLineTaxes, type TaxConfig, type TaxSnapshotEntry } from '../../shared/taxes.service';
import { recalcOrderTotals } from '../config-local/waiter-order.service';
import { getActiveSessionForUserInBranch } from './cash.service';
import { authorizeVoid } from './void-authorizations.service';
import { COURTESY_RECEIPT_CODE } from './billing-series.service';
import { resolveEmisor } from './billing.service';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import type { AuditActor } from '../warehouse/types';

// Cortesías (motivos del catálogo reasons type='courtesy'):
// - Pedido completo: se cierra en 0, sin ingreso de caja, con un documento interno de cortesía (CT).
// - Producto suelto: la línea queda en 0 (courtesyAmount guarda su valor); no va al comprobante
//   SUNAT y se documenta en el documento de cortesía que acompaña al comprobante del pedido.
// Siempre con contraseña de un supervisor (seguridad.autorizar_cortesia), salvo quien tiene
// seguridad.cortesia_sin_contrasena (lo resuelve el controller en `skipPassword`).

type Db = ReturnType<typeof getTenantDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type OrderItemRow = typeof orderItems.$inferSelect;

export interface CourtesyInput {
  reasonId: number;
  password?: string;
  /** Código de 6 dígitos que el supervisor aprobó por WhatsApp (void_authorizations, tipo courtesy) */
  authCode?: string;
  skipPassword?: boolean;
}

const r2 = (n: number) => roundMoney(n, 2);
const padSequential = (n: number) => String(n).padStart(8, '0');

async function loadCourtesyReason(db: Db, branchId: number, reasonId: number) {
  const [reason] = await db.select().from(reasons)
    .where(and(eq(reasons.id, reasonId), eq(reasons.branchId, branchId), eq(reasons.type, 'courtesy')));
  if (!reason || !reason.isActive) throw new Error('Motivo de cortesía inválido o inactivo');
  return reason;
}

function assertWithinCap(reason: typeof reasons.$inferSelect, amount: number) {
  if (reason.maxAmount != null && amount > toNum(reason.maxAmount)) {
    throw new Error(`La cortesía (S/ ${amount.toFixed(2)}) supera el tope del motivo (S/ ${toNum(reason.maxAmount).toFixed(2)})`);
  }
}

// Contraseña de un supervisor (seguridad.autorizar_cortesia) o el código de WhatsApp de esa misma
// cortesía (pedido completo o producto) pedido por el mismo usuario; el código se consume al usarlo.
// El código puede llegar en `authCode` o escrito en el campo de contraseña.
async function authorizeCourtesy(
  input: CourtesyInput,
  target: { orderId: string; orderItemId?: number },
  requesterId: number | undefined,
): Promise<number | null> {
  if (input.skipPassword) return null;
  const authorizedById = await authorizeVoid(
    { type: 'courtesy', ...target },
    { password: input.password, authCode: input.authCode ?? input.password },
    requesterId,
  );
  if (!authorizedById) throw new Error('Contraseña de autorización inválida o código vencido o ya usado');
  return authorizedById;
}

async function loadOpenOrder(db: Db, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (order.status === 'cancelled' || order.status === 'completed') throw new Error('El pedido ya está anulado o cerrado');
  if (order.paymentStatus === 'paid') throw new Error('El pedido ya está pagado');
  if (order.transferredSessionId != null) throw new Error('El pedido está transferido a caja; regrésalo para modificarlo');
  if (toNum(order.discountAmount) > 0) throw new Error('El pedido tiene un descuento: quítalo antes de dar la cortesía');
  const [split] = await db.select({ id: orderSplits.id }).from(orderSplits).where(eq(orderSplits.orderId, orderId)).limit(1);
  if (split) throw new Error('Da la cortesía antes de dividir la cuenta');
  return order;
}

// Línea en 0: los impuestos se ponen en 0 conservando su configuración (sin recalcular con
// base 0, que daría importes negativos con impuestos fijos como el ICBPER)
function zeroTaxSnapshot(snapshot: unknown): TaxSnapshotEntry[] {
  return ((snapshot as TaxSnapshotEntry[] | null) ?? []).map((t) => ({ ...t, amount: 0 }));
}

async function markLineCourtesy(tx: Tx, line: OrderItemRow, meta: {
  reasonId: number; motivo: string; byId: number | null; authorizedById: number | null; at: Date;
}) {
  await tx.update(orderItems).set({
    isCourtesy: true,
    courtesyAmount: r2(toNum(line.totalPrice)).toFixed(2),
    totalPrice: '0.00',
    taxSnapshot: zeroTaxSnapshot(line.taxSnapshot) as any,
    courtesyReasonId: meta.reasonId,
    courtesyMotivo: meta.motivo,
    courtesyById: meta.byId,
    courtesyAuthorizedById: meta.authorizedById,
    courtesyAt: meta.at,
  }).where(eq(orderItems.id, line.id));
}

// Restaura la línea a su precio: impuestos recalculados desde el valor de referencia
async function restoreLine(tx: Tx | Db, line: OrderItemRow) {
  const gross = r2(toNum(line.courtesyAmount));
  const taxes = resolveLineTaxes(gross, line.quantity, line.taxSnapshot as TaxConfig[]);
  await tx.update(orderItems).set({
    isCourtesy: false,
    totalPrice: gross.toFixed(2),
    taxSnapshot: taxes.taxSnapshot as any,
    courtesyAmount: '0.00',
    courtesyReasonId: null,
    courtesyMotivo: null,
    courtesyById: null,
    courtesyAuthorizedById: null,
    courtesyAt: null,
  }).where(eq(orderItems.id, line.id));
}

async function syncOrderCourtesyAmount(tx: Tx | Db, orderId: string) {
  const lines = await tx.select({ amount: orderItems.courtesyAmount }).from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt), eq(orderItems.isCourtesy, true)));
  const amount = r2(lines.reduce((s, l) => s + toNum(l.amount), 0));
  await tx.update(orders).set({ courtesyAmount: amount.toFixed(2), updatedAt: new Date() }).where(eq(orders.id, orderId));
}

// Serie interna CT01 de la caja (se crea la primera vez)
async function ensureCourtesySeries(tx: Tx, registerId: number): Promise<number> {
  const [existing] = await tx.select().from(cashRegisterDocumentSeries)
    .where(and(
      eq(cashRegisterDocumentSeries.registerId, registerId),
      eq(cashRegisterDocumentSeries.receiptTypeCode, COURTESY_RECEIPT_CODE),
    ))
    .limit(1);
  if (existing) {
    if (!existing.isActive) {
      await tx.update(cashRegisterDocumentSeries).set({ isActive: true, updatedAt: new Date() })
        .where(eq(cashRegisterDocumentSeries.id, existing.id));
    }
    return existing.id;
  }
  const [created] = await tx.insert(cashRegisterDocumentSeries).values({
    registerId,
    receiptTypeCode: COURTESY_RECEIPT_CODE,
    series: 'CT01',
    description: 'Cortesía (documento interno)',
    initialSequential: 1,
    lastSequential: 0,
    isActiveFacturacion: false,
    isActive: true,
  }).returning();
  return created.id;
}

/**
 * Emite el documento interno de cortesía con las líneas en cortesía del pedido (si no tiene ya
 * uno vigente). Total 0; cada línea lleva su valor de referencia. Devuelve el id o null.
 */
export async function createCourtesyDocument(
  tx: Tx,
  order: typeof orders.$inferSelect,
  registerId: number,
  createdBy: string | null,
): Promise<number | null> {
  const [existing] = await tx.select({ id: billingDocuments.id }).from(billingDocuments)
    .where(and(
      eq(billingDocuments.orderId, order.id),
      eq(billingDocuments.documentType, 'cortesia'),
      eq(billingDocuments.status, 'issued'),
    ))
    .limit(1);
  if (existing) return null;

  const lines = await tx.select().from(orderItems)
    .where(and(eq(orderItems.orderId, order.id), isNull(orderItems.deletedAt), eq(orderItems.isCourtesy, true)));
  if (lines.length === 0) return null;

  const seriesId = await ensureCourtesySeries(tx, registerId);
  const [series] = await tx.select().from(cashRegisterDocumentSeries)
    .where(eq(cashRegisterDocumentSeries.id, seriesId)).for('update');
  const sequential = series.lastSequential + 1;
  await tx.update(cashRegisterDocumentSeries).set({ lastSequential: sequential, updatedAt: new Date() })
    .where(eq(cashRegisterDocumentSeries.id, seriesId));

  const amount = r2(lines.reduce((s, l) => s + toNum(l.courtesyAmount), 0));
  const motivos = [...new Set(lines.map((l) => l.courtesyMotivo).filter(Boolean))].join(' / ').slice(0, 200) || null;
  const emisor = await resolveEmisor(tx as unknown as Db, order.branchId);

  const [doc] = await tx.insert(billingDocuments).values({
    branchId: order.branchId,
    orderId: order.id,
    splitId: null,
    seriesId,
    documentType: 'cortesia',
    series: series.series,
    sequential,
    documentNumber: `${series.series}-${padSequential(sequential)}`,
    buyerDocType: null,
    buyerDocNumber: null,
    buyerName: order.customerName?.trim() || 'CLIENTE FINAL',
    emisorRuc: emisor.ruc || null,
    emisorName: emisor.name || null,
    emisorAddress: emisor.address || null,
    subtotal: '0.00',
    taxRate: '0.00',
    taxAmount: '0.00',
    total: '0.00',
    courtesyAmount: amount.toFixed(2),
    courtesyMotivo: motivos,
    status: 'issued',
    notes: motivos ? `Cortesía: ${motivos}` : 'Cortesía',
    createdBy,
    issuedAt: new Date(),
  }).returning();

  // Cada línea con su valor de referencia (lo que habría costado); el documento suma 0
  await tx.insert(billingDocumentLines).values(lines.map((l) => {
    const ref = r2(toNum(l.courtesyAmount));
    return {
      documentId: doc.id,
      orderItemId: l.id,
      productId: l.productId,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: (l.quantity > 0 ? r2(ref / l.quantity) : 0).toFixed(2),
      alternativesDesc: null,
      packagingFee: '0.00',
      subtotal: ref.toFixed(2),
      taxAmount: '0.00',
      lineTotal: ref.toFixed(2),
      notes: l.notes,
    };
  }));
  return doc.id;
}

/** Cortesía de todo el pedido: lo cierra en 0, sin cobro, y emite el documento CT. */
export async function giveOrderCourtesy(orderId: string, input: CourtesyInput, actor?: AuditActor) {
  const db = getTenantDb();
  const order = await loadOpenOrder(db, orderId);
  if (toNum(order.deliveryFee) > 0) {
    throw new Error('El pedido tiene costo de delivery: cóbralo normal y da la cortesía por producto');
  }
  const reason = await loadCourtesyReason(db, order.branchId, input.reasonId);

  const lines = await db.select().from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
  if (lines.length === 0) throw new Error('El pedido no tiene productos');
  const newAmount = r2(lines.filter((l) => !l.isCourtesy).reduce((s, l) => s + toNum(l.totalPrice), 0));
  const totalAmount = r2(newAmount + lines.filter((l) => l.isCourtesy).reduce((s, l) => s + toNum(l.courtesyAmount), 0));
  assertWithinCap(reason, newAmount);

  const session = await getActiveSessionForUserInBranch(actor?.userId, order.branchId);
  if (!session || session.registerId == null) throw new Error('Necesitas un turno de caja abierto para registrar la cortesía');
  // Después del turno: un código de WhatsApp no se consume si la cortesía no puede registrarse
  const authorizedById = await authorizeCourtesy(input, { orderId }, actor?.userId);

  const at = new Date();
  const docId = await db.transaction(async (tx) => {
    for (const line of lines.filter((l) => !l.isCourtesy)) {
      await markLineCourtesy(tx, line, { reasonId: reason.id, motivo: reason.description, byId: actor?.userId ?? null, authorizedById, at });
    }
    await recalcOrderTotals(tx as never, orderId);
    // Cerrado como un cobro (completo, en el turno de quien la registra) pero sin ingreso de caja
    await tx.update(orders).set({
      isCourtesy: true,
      courtesyAmount: totalAmount.toFixed(2),
      courtesyReasonId: reason.id,
      courtesyMotivo: reason.description,
      courtesyById: actor?.userId ?? null,
      courtesyAuthorizedById: authorizedById,
      courtesyAt: at,
      paymentStatus: 'paid',
      status: 'completed',
      paymentMethod: 'Cortesía',
      paymentMethodId: null,
      collectedSessionId: session.id,
      retentionPercentage: '0.00',
      retentionAmount: '0.00',
      tipAmount: '0.00',
      total: '0.00',
      updatedAt: at,
    }).where(eq(orders.id, orderId));
    if (order.tableId) {
      await tx.update(tables).set({ statusCode: 'dirty', statusUpdatedAt: at, updatedAt: at }).where(eq(tables.id, order.tableId));
    }
    const [fresh] = await tx.select().from(orders).where(eq(orders.id, orderId));
    return createCourtesyDocument(tx, fresh, session.registerId!, actor?.userName ?? null);
  });

  await writeAuditLog({
    tableName: 'orders',
    operation: 'UPDATE',
    recordId: null,
    afterData: { orderId, courtesy: 'order', reasonId: reason.id, amount: totalAmount, authorizedById, documentId: docId },
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'pedidos',
    description: `Cortesía del pedido ${order.trackingCode ?? orderId} (S/ ${totalAmount.toFixed(2)}). Motivo: ${reason.description}`,
  });

  const [doc] = docId ? await db.select().from(billingDocuments).where(eq(billingDocuments.id, docId)) : [];
  return { orderId, courtesyAmount: totalAmount.toFixed(2), document: doc ?? null };
}

/** Cortesía de un producto del pedido abierto: la línea queda en 0. */
export async function giveItemCourtesy(orderId: string, itemId: number, input: CourtesyInput, actor?: AuditActor) {
  const db = getTenantDb();
  const order = await loadOpenOrder(db, orderId);
  const [line] = await db.select().from(orderItems).where(eq(orderItems.id, itemId));
  if (!line || line.orderId !== orderId) throw new Error('Producto no encontrado en el pedido');
  if (line.deletedAt) throw new Error('El producto está anulado');
  if (line.isCourtesy) throw new Error('El producto ya es cortesía');
  const amount = r2(toNum(line.totalPrice));
  if (amount <= 0) throw new Error('El producto no tiene importe');

  const reason = await loadCourtesyReason(db, order.branchId, input.reasonId);
  assertWithinCap(reason, amount);
  const authorizedById = await authorizeCourtesy(input, { orderId, orderItemId: itemId }, actor?.userId);

  await db.transaction(async (tx) => {
    await markLineCourtesy(tx, line, { reasonId: reason.id, motivo: reason.description, byId: actor?.userId ?? null, authorizedById, at: new Date() });
    await recalcOrderTotals(tx as never, orderId);
    await syncOrderCourtesyAmount(tx, orderId);
  });

  await writeAuditLog({
    tableName: 'order_items',
    operation: 'UPDATE',
    recordId: itemId,
    afterData: { orderId, courtesy: 'item', reasonId: reason.id, amount, authorizedById },
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'pedidos',
    description: `Cortesía de ${line.quantity} x ${line.productName} (S/ ${amount.toFixed(2)}) en el pedido ${order.trackingCode ?? orderId}. Motivo: ${reason.description}`,
  });

  return { orderId, itemId, courtesyAmount: amount.toFixed(2) };
}

/** Quita la cortesía de un producto del pedido abierto (vuelve a su precio). */
export async function removeItemCourtesy(orderId: string, itemId: number, actor?: AuditActor) {
  const db = getTenantDb();
  const order = await loadOpenOrder(db, orderId);
  const [line] = await db.select().from(orderItems).where(eq(orderItems.id, itemId));
  if (!line || line.orderId !== orderId || line.deletedAt) throw new Error('Producto no encontrado en el pedido');
  if (!line.isCourtesy) throw new Error('El producto no es cortesía');

  await db.transaction(async (tx) => {
    await restoreLine(tx, line);
    await recalcOrderTotals(tx as never, orderId);
    await syncOrderCourtesyAmount(tx, orderId);
  });

  await writeAuditLog({
    tableName: 'order_items',
    operation: 'UPDATE',
    recordId: itemId,
    afterData: { orderId, courtesy: 'removed' },
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'pedidos',
    description: `Se quitó la cortesía de ${line.productName} en el pedido ${order.trackingCode ?? orderId}`,
  });
  return { orderId, itemId };
}

/**
 * Al anular el documento de cortesía de un pedido regalado completo: deshace la cortesía
 * (las líneas vuelven a su precio) para que el pedido pueda cobrarse o anularse normal.
 */
export async function revertOrderCourtesy(db: Db, orderId: string) {
  const lines = await db.select().from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt), eq(orderItems.isCourtesy, true)));
  for (const line of lines) await restoreLine(db, line);
  await recalcOrderTotals(db as never, orderId);
  await db.update(orders).set({
    isCourtesy: false,
    courtesyAmount: '0.00',
    courtesyReasonId: null,
    courtesyMotivo: null,
    courtesyById: null,
    courtesyAuthorizedById: null,
    courtesyAt: null,
    updatedAt: new Date(),
  }).where(eq(orders.id, orderId));
}

/** Documentos de cortesía vigentes del pedido (para anularlos junto con el comprobante). */
export async function issuedCourtesyDocumentIds(db: Db, orderId: string, exceptId?: number): Promise<number[]> {
  const rows = await db.select({ id: billingDocuments.id }).from(billingDocuments)
    .where(and(
      eq(billingDocuments.orderId, orderId),
      eq(billingDocuments.documentType, 'cortesia'),
      eq(billingDocuments.status, 'issued'),
      exceptId != null ? sql`${billingDocuments.id} <> ${exceptId}` : sql`true`,
    ));
  return rows.map((r) => r.id);
}

export interface SessionCourtesyRow {
  documentId: number;
  documentNumber: string;
  orderTrackingCode: string | null;
  issuedAt: Date | null;
  amount: number;
  motivo: string | null;
  status: string;
  user: string | null;
}

/**
 * Cortesías del turno (documentos de cortesía de los pedidos cerrados en él). No suman a ventas
 * ni a caja: el resumen es solo informativo (cantidad y valor de referencia de las vigentes).
 */
export async function getSessionCourtesies(sessionId: number): Promise<{ count: number; amount: number; rows: SessionCourtesyRow[] }> {
  const db = getTenantDb();
  const rows = await db
    .select({ doc: billingDocuments, trackingCode: orders.trackingCode })
    .from(billingDocuments)
    .innerJoin(orders, eq(billingDocuments.orderId, orders.id))
    .where(and(eq(billingDocuments.documentType, 'cortesia'), eq(orders.collectedSessionId, sessionId)))
    .orderBy(billingDocuments.sequential);
  const list: SessionCourtesyRow[] = rows.map((r) => ({
    documentId: r.doc.id,
    documentNumber: r.doc.documentNumber,
    orderTrackingCode: r.trackingCode,
    issuedAt: r.doc.issuedAt,
    amount: r2(toNum(r.doc.courtesyAmount)),
    motivo: r.doc.courtesyMotivo,
    status: r.doc.status,
    user: r.doc.createdBy,
  }));
  const valid = list.filter((r) => r.status === 'issued');
  return { count: valid.length, amount: r2(valid.reduce((s, r) => s + r.amount, 0)), rows: list };
}

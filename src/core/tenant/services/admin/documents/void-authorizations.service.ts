import { createHash, randomBytes, randomInt } from 'crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import { billingDocuments, branches, orderItems, orders, users, voidAuthorizations } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import type { AuditActor } from '../warehouse/types';
import { authorizeByPassword } from './security-auth.service';

// Autorización remota de anulaciones (pedido, producto enviado o comprobante) por WhatsApp.
// Mismo modelo que el cierre de turno (cash-terminals.service): el token del enlace y el código
// solo se guardan como hash SHA-256 y se muestran una única vez. El código vale para esa anulación
// y para quien la pidió.

export type VoidType = 'order' | 'item' | 'document';

export interface VoidTarget {
  type: VoidType;
  orderId?: string;
  orderItemId?: number;
  documentId?: number;
}

const REQUEST_TTL_MIN = 30;
const MAX_FAILED_ATTEMPTS = 5;

// Permiso cuya contraseña aprueba cada tipo de anulación (rol_admin siempre)
export const VOID_APPROVER_PERMISSION: Record<VoidType, string> = {
  order: 'seguridad.autorizar_eliminar_pedido',
  item: 'seguridad.autorizar_eliminar_producto',
  document: 'seguridad.autorizar_anular_documento',
};

const sha256 = (value: string) => createHash('sha256').update(value.trim()).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const newSixDigitCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

/** Error de negocio con código HTTP sugerido para el controller. */
export class VoidAuthorizationError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 423;
  constructor(message: string, status: 400 | 403 | 404 | 409 | 410 | 423 = 400) {
    super(message);
    this.status = status;
  }
}

/** El cajero o mozo pide autorización para anular; devuelve el token del enlace (solo esta vez). */
export async function createVoidRequest(
  input: VoidTarget & { motivo?: string; quantity?: number },
  actor?: AuditActor,
) {
  const db = getTenantDb();
  let target: { orderId: string | null; orderItemId: number | null; documentId: number | null; branchId: number };
  let summary: Record<string, unknown>;

  if (input.type === 'document') {
    if (!input.documentId) throw new VoidAuthorizationError('Comprobante (documentId) es requerido');
    const [doc] = await db
      .select({ id: billingDocuments.id, status: billingDocuments.status, branchId: billingDocuments.branchId, orderId: billingDocuments.orderId, documentNumber: billingDocuments.documentNumber, total: billingDocuments.total })
      .from(billingDocuments)
      .where(eq(billingDocuments.id, input.documentId))
      .limit(1);
    if (!doc) throw new VoidAuthorizationError('Comprobante no encontrado', 404);
    if (doc.status !== 'issued') throw new VoidAuthorizationError('El comprobante ya no está vigente', 409);
    target = { orderId: doc.orderId, orderItemId: null, documentId: doc.id, branchId: doc.branchId };
    summary = { documentNumber: doc.documentNumber, amount: doc.total };
  } else {
    if (!input.orderId) throw new VoidAuthorizationError('Pedido (orderId) es requerido');
    const [order] = await db
      .select({ id: orders.id, status: orders.status, branchId: orders.branchId, trackingCode: orders.trackingCode, tableName: orders.tableName, total: orders.total })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    if (!order) throw new VoidAuthorizationError('Pedido no encontrado', 404);
    if (order.status === 'cancelled' || order.status === 'completed') throw new VoidAuthorizationError('El pedido ya está cerrado o anulado', 409);
    summary = { orderNumber: order.trackingCode ?? order.id, tableName: order.tableName, amount: order.total };

    let orderItemId: number | null = null;
    if (input.type === 'item') {
      if (!input.orderItemId) throw new VoidAuthorizationError('Producto (orderItemId) es requerido');
      const [oi] = await db
        .select({ id: orderItems.id, orderId: orderItems.orderId, productName: orderItems.productName, quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, deletedAt: orderItems.deletedAt })
        .from(orderItems)
        .where(eq(orderItems.id, input.orderItemId))
        .limit(1);
      if (!oi || oi.orderId !== order.id) throw new VoidAuthorizationError('Producto no encontrado en el pedido', 404);
      if (oi.deletedAt) throw new VoidAuthorizationError('El producto ya está anulado', 409);
      const qty = input.quantity && input.quantity > 0 ? Math.min(Math.floor(input.quantity), oi.quantity) : oi.quantity;
      orderItemId = oi.id;
      summary = { ...summary, productName: oi.productName, quantity: qty, amount: (Number(oi.unitPrice) * qty).toFixed(2) };
    }
    target = { orderId: order.id, orderItemId, documentId: null, branchId: order.branchId };
  }

  const motivo = input.motivo?.trim().slice(0, 200);
  if (motivo) summary.motivo = motivo;

  const requestToken = newToken();
  const expiresAt = new Date(Date.now() + REQUEST_TTL_MIN * 60 * 1000);
  const [row] = await db
    .insert(voidAuthorizations)
    .values({
      type: input.type,
      ...target,
      summary,
      requestTokenHash: sha256(requestToken),
      requestedById: actor?.userId ?? null,
      expiresAt,
    })
    .returning({ id: voidAuthorizations.id });

  return { id: row.id, requestToken, expiresAt };
}

async function findRequest(requestToken: string) {
  const db = getTenantDb();
  const [req] = await db
    .select()
    .from(voidAuthorizations)
    .where(eq(voidAuthorizations.requestTokenHash, sha256(requestToken)))
    .limit(1);
  return req ?? null;
}

/** Resumen público de la solicitud (para la página del supervisor). */
export async function getVoidRequestSummary(requestToken: string) {
  const req = await findRequest(requestToken);
  if (!req) throw new VoidAuthorizationError('Solicitud no encontrada', 404);
  const db = getTenantDb();
  const [branch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, req.branchId)).limit(1);
  const [requester] = req.requestedById
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, req.requestedById)).limit(1)
    : [];

  const expired = req.expiresAt.getTime() < Date.now();
  return {
    type: req.type,
    status: expired && req.status !== 'used' ? 'expired' : req.status,
    expiresAt: req.expiresAt,
    branchName: branch?.name ?? null,
    requestedByName: requester?.name ?? null,
    summary: req.summary ?? {},
  };
}

/**
 * El supervisor aprueba con su contraseña (validada aquí, en la API). Devuelve el código de 6 dígitos
 * que el cajero ingresará para anular. La contraseña nunca sale del celular del supervisor.
 */
export async function approveVoidRequest(requestToken: string, password: string, ip?: string | null) {
  const db = getTenantDb();
  const req = await findRequest(requestToken);
  if (!req) throw new VoidAuthorizationError('Solicitud no encontrada', 404);
  if (req.status === 'locked') throw new VoidAuthorizationError('La solicitud se bloqueó por demasiados intentos. Pide una nueva.', 423);
  if (req.status !== 'pending') throw new VoidAuthorizationError('Esta solicitud ya fue aprobada o usada', 409);
  if (req.expiresAt.getTime() < Date.now()) throw new VoidAuthorizationError('La solicitud venció. Pide una nueva.', 410);

  const auth = password?.trim() ? await authorizeByPassword(VOID_APPROVER_PERMISSION[req.type], password) : null;
  if (!auth) {
    const failed = req.failedAttempts + 1;
    await db
      .update(voidAuthorizations)
      .set({ failedAttempts: failed, status: failed >= MAX_FAILED_ATTEMPTS ? 'locked' : 'pending' })
      .where(eq(voidAuthorizations.id, req.id));
    const left = MAX_FAILED_ATTEMPTS - failed;
    throw new VoidAuthorizationError(
      left > 0 ? `Contraseña incorrecta o sin permiso para autorizar anulaciones. Te quedan ${left} intento(s).` : 'Contraseña incorrecta. La solicitud se bloqueó; hay que pedir una nueva.',
      left > 0 ? 403 : 423,
    );
  }

  const code = newSixDigitCode();
  const [approved] = await db
    .update(voidAuthorizations)
    .set({ status: 'approved', codeHash: sha256(code), approvedById: auth.userId, approvedAt: new Date(), failedAttempts: 0 })
    .where(and(eq(voidAuthorizations.id, req.id), eq(voidAuthorizations.status, 'pending')))
    .returning({ id: voidAuthorizations.id });
  if (!approved) throw new VoidAuthorizationError('Esta solicitud ya fue aprobada', 409);

  const [approver] = await db.select({ name: users.name }).from(users).where(eq(users.id, auth.userId)).limit(1);
  const s = (req.summary ?? {}) as Record<string, unknown>;
  const what = req.type === 'document' ? `del comprobante ${s.documentNumber ?? req.documentId}`
    : req.type === 'item' ? `de ${s.productName ?? 'un producto'} del pedido ${s.orderNumber ?? req.orderId}`
    : `del pedido ${s.orderNumber ?? req.orderId}`;
  await writeAuditLog({
    tableName: 'void_authorizations',
    operation: 'UPDATE',
    recordId: req.id,
    afterData: { status: 'approved', type: req.type, orderId: req.orderId, orderItemId: req.orderItemId, documentId: req.documentId, approvedById: auth.userId },
    userId: auth.userId,
    userName: approver?.name ?? null,
    module: req.type === 'document' ? 'facturacion' : 'pedidos',
    description: `Anulación remota ${what} autorizada por ${approver?.name ?? `usuario ${auth.userId}`}`,
    ipAddress: ip ?? null,
  });

  return { code, expiresAt: req.expiresAt, approvedByName: approver?.name ?? null };
}

/**
 * Canjea el código para esa anulación y ese solicitante. Devuelve el id del supervisor que lo
 * aprobó, o null si no corresponde (suma un intento fallido y bloquea al llegar al tope).
 */
// consume=false solo verifica (la anulación lo consume después); los intentos fallidos cuentan igual.
async function consumeVoidCode(target: VoidTarget, code: string, requesterId: number | undefined, consume = true): Promise<number | null> {
  const db = getTenantDb();
  const clean = code.replace(/\D/g, '');
  const targetCond = target.type === 'document'
    ? eq(voidAuthorizations.documentId, target.documentId ?? -1)
    : target.type === 'item'
      ? and(eq(voidAuthorizations.orderId, target.orderId ?? ''), eq(voidAuthorizations.orderItemId, target.orderItemId ?? -1))
      : eq(voidAuthorizations.orderId, target.orderId ?? '');
  const [req] = await db
    .select()
    .from(voidAuthorizations)
    .where(and(
      eq(voidAuthorizations.type, target.type),
      targetCond,
      requesterId ? eq(voidAuthorizations.requestedById, requesterId) : undefined,
      eq(voidAuthorizations.status, 'approved'),
      gt(voidAuthorizations.expiresAt, new Date()),
    ))
    .orderBy(desc(voidAuthorizations.approvedAt))
    .limit(1);
  if (!req) return null;

  if (clean.length !== 6 || req.codeHash !== sha256(clean)) {
    const failed = req.failedAttempts + 1;
    await db
      .update(voidAuthorizations)
      .set({ failedAttempts: failed, status: failed >= MAX_FAILED_ATTEMPTS ? 'locked' : 'approved' })
      .where(eq(voidAuthorizations.id, req.id));
    return null;
  }
  if (!consume) return req.approvedById;

  const [used] = await db
    .update(voidAuthorizations)
    .set({ status: 'used', usedAt: new Date() })
    .where(and(eq(voidAuthorizations.id, req.id), eq(voidAuthorizations.status, 'approved')))
    .returning({ approvedById: voidAuthorizations.approvedById });
  return used?.approvedById ?? null;
}

/**
 * Autoriza una anulación con el código remoto (6 dígitos) o con la contraseña de un supervisor.
 * El código va primero: una contraseña numérica de 6 dígitos llega en los dos campos.
 */
export async function authorizeVoid(
  target: VoidTarget,
  input: { password?: string; authCode?: string },
  requesterId: number | undefined,
  consume = true,
): Promise<number | null> {
  const authCode = input.authCode?.trim();
  if (authCode && /^\d{6}$/.test(authCode)) {
    const approvedById = await consumeVoidCode(target, authCode, requesterId, consume);
    if (approvedById) return approvedById;
  }
  const password = input.password?.trim();
  if (!password) return null;
  const auth = await authorizeByPassword(VOID_APPROVER_PERMISSION[target.type], password);
  return auth?.userId ?? null;
}

/** Valida la contraseña o el código sin consumirlo y devuelve quién autoriza (para mostrarlo antes de anular). */
export async function verifyVoidAuthorization(
  target: VoidTarget,
  input: { password?: string; authCode?: string },
  requesterId: number | undefined,
) {
  const authorizedById = await authorizeVoid(target, input, requesterId, false);
  if (!authorizedById) {
    throw new VoidAuthorizationError('Contraseña de autorización inválida o código vencido o ya usado. Si el código venció, solicita uno nuevo.', 403);
  }
  const db = getTenantDb();
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, authorizedById)).limit(1);
  return { authorizedById, authorizedByName: u?.name ?? null };
}

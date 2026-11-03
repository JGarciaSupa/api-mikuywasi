import { createHash, randomBytes, randomInt } from 'crypto';
import { and, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import {
  branches,
  cashCloseAuthorizations,
  cashRegisters,
  cashSessions,
  cashTerminalPairingCodes,
  cashTerminals,
  orders,
  users,
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import type { AuditActor } from '../warehouse/types';
import { authorizeByPassword } from './security-auth.service';

// Vinculación de equipos de caja y autorización remota de cierre de turno.
// Los secretos (token del equipo, PIN, token de solicitud y código de cierre) nunca se guardan:
// solo su hash SHA-256. Se muestran una única vez al generarlos.

const PAIRING_TTL_MIN = 15;
const CLOSE_REQUEST_TTL_MIN = 30;
const MAX_FAILED_ATTEMPTS = 5;

function sha256(value: string): string {
  return createHash('sha256').update(value.trim()).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function newSixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/** Error de negocio con código HTTP sugerido para el controller. */
export class CashTerminalError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 423;
  constructor(message: string, status: 400 | 403 | 404 | 409 | 410 | 423 = 400) {
    super(message);
    this.status = status;
  }
}

/** El turno exige un equipo vinculado a la caja y la petición no trae uno válido. */
export class TerminalRequiredError extends Error {
  constructor(message = 'Este equipo no está vinculado a la caja. Solicita a tu Administrador que lo vincule desde Configuración de Cajas.') {
    super(message);
  }
}

// ─── Vinculación de equipos ──────────────────────────────────────────────────

/** Genera un PIN de 6 dígitos y un token de enlace para vincular un equipo a la caja. */
export async function createPairingCode(registerId: number, actor?: AuditActor) {
  const db = getTenantDb();
  const [reg] = await db
    .select({ id: cashRegisters.id, name: cashRegisters.name, branchId: cashRegisters.branchId, isActive: cashRegisters.isActive, branchName: branches.name })
    .from(cashRegisters)
    .innerJoin(branches, eq(branches.id, cashRegisters.branchId))
    .where(eq(cashRegisters.id, registerId))
    .limit(1);
  if (!reg) throw new CashTerminalError('Caja no encontrada', 404);
  if (!reg.isActive) throw new CashTerminalError('La caja está inactiva');

  // El PIN no debe coincidir con otro PIN vigente del tenant (se busca por hash al canjearlo)
  const now = new Date();
  let code = newSixDigitCode();
  for (let i = 0; i < 5; i++) {
    const [clash] = await db
      .select({ id: cashTerminalPairingCodes.id })
      .from(cashTerminalPairingCodes)
      .where(and(eq(cashTerminalPairingCodes.codeHash, sha256(code)), isNull(cashTerminalPairingCodes.usedAt), gt(cashTerminalPairingCodes.expiresAt, now)))
      .limit(1);
    if (!clash) break;
    code = newSixDigitCode();
  }
  const token = newToken();
  const expiresAt = minutesFromNow(PAIRING_TTL_MIN);

  const [row] = await db
    .insert(cashTerminalPairingCodes)
    .values({
      registerId: reg.id,
      branchId: reg.branchId,
      codeHash: sha256(code),
      tokenHash: sha256(token),
      createdById: actor?.userId ?? null,
      expiresAt,
    })
    .returning({ id: cashTerminalPairingCodes.id });

  await writeAuditLog({
    tableName: 'cash_terminal_pairing_codes',
    operation: 'INSERT',
    recordId: row.id,
    afterData: { registerId: reg.id, branchId: reg.branchId, expiresAt },
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'caja',
    description: `Código de vinculación de equipo generado para la caja "${reg.name}"`,
    ipAddress: actor?.ip ?? null,
  });

  return { code, token, expiresAt, registerId: reg.id, registerName: reg.name, branchId: reg.branchId, branchName: reg.branchName };
}

/** Canjea un PIN o token de enlace: registra el equipo y devuelve su token (solo esta vez). */
export async function redeemPairingCode(
  input: { code?: string; token?: string; deviceName?: string },
  actor?: AuditActor,
) {
  const db = getTenantDb();
  const code = input.code?.replace(/\D/g, '') ?? '';
  const linkToken = input.token?.trim() ?? '';
  if (!linkToken && code.length !== 6) throw new CashTerminalError('Ingresa el código de 6 dígitos o abre el enlace de vinculación');

  const now = new Date();
  const [pairing] = await db
    .select()
    .from(cashTerminalPairingCodes)
    .where(and(
      linkToken ? eq(cashTerminalPairingCodes.tokenHash, sha256(linkToken)) : eq(cashTerminalPairingCodes.codeHash, sha256(code)),
      isNull(cashTerminalPairingCodes.usedAt),
      gt(cashTerminalPairingCodes.expiresAt, now),
    ))
    .orderBy(desc(cashTerminalPairingCodes.createdAt))
    .limit(1);
  if (!pairing) throw new CashTerminalError('El código no es válido, ya fue usado o venció. Solicita uno nuevo a tu Administrador.', 410);

  const [reg] = await db
    .select({ name: cashRegisters.name, isActive: cashRegisters.isActive, branchName: branches.name })
    .from(cashRegisters)
    .innerJoin(branches, eq(branches.id, cashRegisters.branchId))
    .where(eq(cashRegisters.id, pairing.registerId))
    .limit(1);
  if (!reg?.isActive) throw new CashTerminalError('La caja ya no está activa');

  const terminalToken = newToken();
  const name = input.deviceName?.trim().slice(0, 100) || null;

  const terminal = await db.transaction(async (tx) => {
    // Marca el código como usado solo si nadie lo usó antes (evita doble canje simultáneo)
    const [claimed] = await tx
      .update(cashTerminalPairingCodes)
      .set({ usedAt: now })
      .where(and(eq(cashTerminalPairingCodes.id, pairing.id), isNull(cashTerminalPairingCodes.usedAt)))
      .returning({ id: cashTerminalPairingCodes.id });
    if (!claimed) throw new CashTerminalError('El código ya fue usado. Solicita uno nuevo.', 410);

    const [created] = await tx
      .insert(cashTerminals)
      .values({
        registerId: pairing.registerId,
        branchId: pairing.branchId,
        name,
        tokenHash: sha256(terminalToken),
        pairedById: actor?.userId ?? null,
        lastSeenAt: now,
      })
      .returning();

    await tx.update(cashTerminalPairingCodes).set({ terminalId: created.id }).where(eq(cashTerminalPairingCodes.id, pairing.id));
    return created;
  });

  await writeAuditLog({
    tableName: 'cash_terminals',
    operation: 'INSERT',
    recordId: terminal.id,
    afterData: { id: terminal.id, registerId: terminal.registerId, branchId: terminal.branchId, name: terminal.name },
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'caja',
    description: `Equipo vinculado a la caja "${reg.name}"${name ? ` (${name})` : ''}`,
    ipAddress: actor?.ip ?? null,
  });

  return {
    terminalToken,
    terminal: {
      id: terminal.id,
      name: terminal.name,
      registerId: terminal.registerId,
      registerName: reg.name,
      branchId: terminal.branchId,
      branchName: reg.branchName,
      pairedAt: terminal.pairedAt,
    },
  };
}

/** Equipo vigente (no revocado) que corresponde al token, con nombres de caja y sucursal; o null. */
export async function getTerminalByToken(token?: string | null) {
  if (!token?.trim()) return null;
  const db = getTenantDb();
  const [row] = await db
    .select({
      id: cashTerminals.id,
      name: cashTerminals.name,
      registerId: cashTerminals.registerId,
      registerName: cashRegisters.name,
      branchId: cashTerminals.branchId,
      branchName: branches.name,
      pairedAt: cashTerminals.pairedAt,
    })
    .from(cashTerminals)
    .innerJoin(cashRegisters, eq(cashRegisters.id, cashTerminals.registerId))
    .innerJoin(branches, eq(branches.id, cashTerminals.branchId))
    .where(and(eq(cashTerminals.tokenHash, sha256(token)), isNull(cashTerminals.revokedAt)))
    .limit(1);
  return row ?? null;
}

/** Comprueba que el token pertenece a un equipo vigente vinculado a esa caja y registra su uso. */
export async function isTerminalLinkedToRegister(token: string | null | undefined, registerId: number): Promise<boolean> {
  const terminal = await getTerminalByToken(token);
  if (!terminal || terminal.registerId !== registerId) return false;
  const db = getTenantDb();
  await db.update(cashTerminals).set({ lastSeenAt: new Date() }).where(eq(cashTerminals.id, terminal.id));
  return true;
}

/** Equipos vigentes (opcionalmente de una sucursal), para Configuración de Cajas. */
export async function listTerminals(branchId?: number) {
  const db = getTenantDb();
  return db
    .select({
      id: cashTerminals.id,
      name: cashTerminals.name,
      registerId: cashTerminals.registerId,
      registerName: cashRegisters.name,
      branchId: cashTerminals.branchId,
      pairedAt: cashTerminals.pairedAt,
      lastSeenAt: cashTerminals.lastSeenAt,
      pairedByName: users.name,
    })
    .from(cashTerminals)
    .innerJoin(cashRegisters, eq(cashRegisters.id, cashTerminals.registerId))
    .leftJoin(users, eq(users.id, cashTerminals.pairedById))
    .where(and(isNull(cashTerminals.revokedAt), branchId ? eq(cashTerminals.branchId, branchId) : undefined))
    .orderBy(desc(cashTerminals.pairedAt));
}

/** Revoca un equipo: su token deja de servir para operar la caja. */
export async function revokeTerminal(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const [terminal] = await db.select().from(cashTerminals).where(eq(cashTerminals.id, id)).limit(1);
  if (!terminal) throw new CashTerminalError('Equipo no encontrado', 404);
  if (terminal.revokedAt) return terminal;

  const [revoked] = await db
    .update(cashTerminals)
    .set({ revokedAt: new Date(), revokedById: actor?.userId ?? null })
    .where(eq(cashTerminals.id, id))
    .returning();

  await writeAuditLog({
    tableName: 'cash_terminals',
    operation: 'UPDATE',
    recordId: id,
    beforeData: { revokedAt: null },
    afterData: { revokedAt: revoked.revokedAt },
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'caja',
    description: `Equipo de caja desvinculado${terminal.name ? ` (${terminal.name})` : ''}`,
    ipAddress: actor?.ip ?? null,
  });
  return revoked;
}

// ─── Autorización remota de cierre ───────────────────────────────────────────

/** El cajero pide autorización para cerrar su turno; devuelve el token del enlace (solo esta vez). */
export async function createCloseRequest(sessionId: number, actor?: AuditActor) {
  const db = getTenantDb();
  const [session] = await db.select({ id: cashSessions.id, status: cashSessions.status }).from(cashSessions).where(eq(cashSessions.id, sessionId)).limit(1);
  if (!session) throw new CashTerminalError('Sesión no encontrada', 404);
  if (session.status !== 'open') throw new CashTerminalError('La sesión ya está cerrada', 409);

  const requestToken = newToken();
  const expiresAt = minutesFromNow(CLOSE_REQUEST_TTL_MIN);
  const [row] = await db
    .insert(cashCloseAuthorizations)
    .values({ sessionId, requestTokenHash: sha256(requestToken), requestedById: actor?.userId ?? null, expiresAt })
    .returning({ id: cashCloseAuthorizations.id });

  return { id: row.id, requestToken, expiresAt };
}

async function findCloseRequest(requestToken: string) {
  const db = getTenantDb();
  const [req] = await db
    .select()
    .from(cashCloseAuthorizations)
    .where(eq(cashCloseAuthorizations.requestTokenHash, sha256(requestToken)))
    .limit(1);
  return req ?? null;
}

/** Resumen público de la solicitud (para la página del supervisor). No expone importes del turno. */
export async function getCloseRequestSummary(requestToken: string) {
  const req = await findCloseRequest(requestToken);
  if (!req) throw new CashTerminalError('Solicitud no encontrada', 404);
  const db = getTenantDb();

  const [session] = await db
    .select({ id: cashSessions.id, code: cashSessions.code, status: cashSessions.status, branchId: cashSessions.branchId, openedBy: cashSessions.openedBy, registerName: cashRegisters.name, branchName: branches.name })
    .from(cashSessions)
    .leftJoin(cashRegisters, eq(cashRegisters.id, cashSessions.registerId))
    .innerJoin(branches, eq(branches.id, cashSessions.branchId))
    .where(eq(cashSessions.id, req.sessionId))
    .limit(1);

  // Mismo criterio que el cierre: pedidos de la sucursal no cancelados y sin terminar o sin cobrar
  const [pending] = session
    ? await db
      .select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${orders.total}), 0)::text` })
      .from(orders)
      .where(and(
        eq(orders.branchId, session.branchId),
        ne(orders.status, 'cancelled'),
        or(ne(orders.status, 'completed'), ne(orders.paymentStatus, 'paid')),
      ))
    : [];

  const expired = req.expiresAt.getTime() < Date.now();
  return {
    status: expired && req.status !== 'used' ? 'expired' : req.status,
    expiresAt: req.expiresAt,
    sessionCode: session?.code ?? null,
    sessionOpen: session?.status === 'open',
    cashierName: session?.openedBy ?? null,
    registerName: session?.registerName ?? null,
    branchName: session?.branchName ?? null,
    openOrdersCount: pending?.count ?? 0,
    openOrdersTotal: pending?.total ?? '0',
  };
}

/**
 * El supervisor aprueba con su contraseña (validada aquí, en la API). Devuelve el código de 6 dígitos
 * que el cajero ingresará para cerrar. La contraseña nunca sale del celular del supervisor.
 */
export async function approveCloseRequest(requestToken: string, password: string, ip?: string | null) {
  const db = getTenantDb();
  const req = await findCloseRequest(requestToken);
  if (!req) throw new CashTerminalError('Solicitud no encontrada', 404);
  if (req.status === 'locked') throw new CashTerminalError('La solicitud se bloqueó por demasiados intentos. El cajero debe pedir una nueva.', 423);
  if (req.status !== 'pending') throw new CashTerminalError('Esta solicitud ya fue aprobada o usada', 409);
  if (req.expiresAt.getTime() < Date.now()) throw new CashTerminalError('La solicitud venció. El cajero debe pedir una nueva.', 410);

  const [session] = await db.select({ status: cashSessions.status, code: cashSessions.code }).from(cashSessions).where(eq(cashSessions.id, req.sessionId)).limit(1);
  if (session?.status !== 'open') throw new CashTerminalError('El turno ya está cerrado', 409);

  const auth = password?.trim() ? await authorizeByPassword('seguridad.autorizar_cierre_turno', password) : null;
  if (!auth) {
    const failed = req.failedAttempts + 1;
    await db
      .update(cashCloseAuthorizations)
      .set({ failedAttempts: failed, status: failed >= MAX_FAILED_ATTEMPTS ? 'locked' : 'pending' })
      .where(eq(cashCloseAuthorizations.id, req.id));
    const left = MAX_FAILED_ATTEMPTS - failed;
    throw new CashTerminalError(
      left > 0 ? `Contraseña incorrecta o sin permiso para autorizar cierres. Te quedan ${left} intento(s).` : 'Contraseña incorrecta. La solicitud se bloqueó; el cajero debe pedir una nueva.',
      left > 0 ? 403 : 423,
    );
  }

  const code = newSixDigitCode();
  const [approved] = await db
    .update(cashCloseAuthorizations)
    .set({ status: 'approved', codeHash: sha256(code), approvedById: auth.userId, approvedAt: new Date(), failedAttempts: 0 })
    .where(and(eq(cashCloseAuthorizations.id, req.id), eq(cashCloseAuthorizations.status, 'pending')))
    .returning({ id: cashCloseAuthorizations.id });
  if (!approved) throw new CashTerminalError('Esta solicitud ya fue aprobada', 409);

  const [approver] = await db.select({ name: users.name }).from(users).where(eq(users.id, auth.userId)).limit(1);
  await writeAuditLog({
    tableName: 'cash_close_authorizations',
    operation: 'UPDATE',
    recordId: req.id,
    afterData: { status: 'approved', sessionId: req.sessionId, approvedById: auth.userId },
    userId: auth.userId,
    userName: approver?.name ?? null,
    module: 'caja',
    description: `Cierre remoto del turno ${session.code} autorizado por ${approver?.name ?? `usuario ${auth.userId}`}`,
    ipAddress: ip ?? null,
  });

  return { code, expiresAt: req.expiresAt, approvedByName: approver?.name ?? null };
}

/**
 * Canjea el código de cierre remoto del turno. Devuelve el id del supervisor que lo aprobó,
 * o null si el código no corresponde (suma un intento fallido y bloquea al llegar al tope).
 */
export async function consumeCloseAuthorizationCode(sessionId: number, code: string): Promise<number | null> {
  const db = getTenantDb();
  const clean = code.replace(/\D/g, '');
  const [req] = await db
    .select()
    .from(cashCloseAuthorizations)
    .where(and(
      eq(cashCloseAuthorizations.sessionId, sessionId),
      eq(cashCloseAuthorizations.status, 'approved'),
      gt(cashCloseAuthorizations.expiresAt, new Date()),
    ))
    .orderBy(desc(cashCloseAuthorizations.approvedAt))
    .limit(1);
  if (!req) return null;

  if (clean.length !== 6 || req.codeHash !== sha256(clean)) {
    const failed = req.failedAttempts + 1;
    await db
      .update(cashCloseAuthorizations)
      .set({ failedAttempts: failed, status: failed >= MAX_FAILED_ATTEMPTS ? 'locked' : 'approved' })
      .where(eq(cashCloseAuthorizations.id, req.id));
    return null;
  }

  const [used] = await db
    .update(cashCloseAuthorizations)
    .set({ status: 'used', usedAt: new Date() })
    .where(and(eq(cashCloseAuthorizations.id, req.id), eq(cashCloseAuthorizations.status, 'approved')))
    .returning({ approvedById: cashCloseAuthorizations.approvedById });
  return used?.approvedById ?? null;
}

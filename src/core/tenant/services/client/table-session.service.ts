import { createHash, randomInt, timingSafeEqual } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  branches,
  orderItems,
  orders,
  productExtras,
  products,
  roles,
  tableSessionParticipants,
  tableSessionRounds,
  tableSessions,
  tables,
  userRoles,
  users,
  waiterCalls,
  type TableSessionRoundItem,
} from '@/db/tenant/schema';
import { masterDb } from '@/db';
import { plans, tenants } from '@/db/master/schema';
import { getTenantDb, getTenantId } from '@/utils/tenant-context';
import { cache } from '@/utils/redis';
import { assertStockAvailable } from '../shared/product-stock.service';
import * as tenantService from './tenant.service';
import { editOrderItem } from '../admin/config-local/waiter-order.service';
import * as cashService from '../admin/documents/cash.service';
import { closeOpenTableSession } from './table-session-lifecycle';
import { publishQrUpdate, type QrUpdateKind } from '@/realtime/qr-socket';

const TOKEN_TYPE = 'table_session';
const DAY_INDEX: Record<string, number> = {
  sun: 0, sunday: 0, domingo: 0, dom: 0,
  mon: 1, monday: 1, lunes: 1, lun: 1,
  tue: 2, tuesday: 2, martes: 2, mar: 2,
  wed: 3, wednesday: 3, miercoles: 3, miércoles: 3, mie: 3,
  thu: 4, thursday: 4, jueves: 4, jue: 4,
  fri: 5, friday: 5, viernes: 5, vie: 5,
  sat: 6, saturday: 6, sabado: 6, sábado: 6, sab: 6,
};
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function notifyQr(branchId: number, sessionId: number | null | undefined, tableId: number | null | undefined, kind: QrUpdateKind) {
  try {
    publishQrUpdate({ tenantId: getTenantId(), branchId, sessionId, tableId, kind });
  } catch (error) {
    console.error('[qr] No se pudo avisar el cambio en vivo', error);
  }
}

export class QrError extends Error {
  constructor(message: string, public status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 = 400) {
    super(message);
    this.name = 'QrError';
  }
}

type SessionToken = {
  type: typeof TOKEN_TYPE;
  sessionId: number;
  participantId: number;
  tableId: number;
  tenantId: number;
};

type BranchRow = typeof branches.$inferSelect;

function hashPin(pin: string, salt: string) {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}

function sealPin(pin: string) {
  const salt = randomInt(0, 1_000_000_000).toString(16);
  return `${salt}:${hashPin(pin, salt)}`;
}

function pinMatches(pin: string, stored: string | null) {
  if (!stored) return false;
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = hashPin(pin, salt);
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signSession(payload: SessionToken, expiresAt: Date) {
  const seconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: seconds });
}

export function decodeSessionToken(token: string): SessionToken {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as SessionToken;
  if (payload?.type !== TOKEN_TYPE || !payload.sessionId || !payload.tenantId) {
    throw new QrError('Token de mesa inválido', 401);
  }
  return payload;
}

export function readSessionToken(header: string | undefined): SessionToken {
  if (!header?.startsWith('Bearer ')) throw new QrError('Token de mesa requerido', 401);
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as SessionToken;
    if (payload?.type !== TOKEN_TYPE || payload.tenantId !== getTenantId()) {
      throw new QrError('Token de mesa inválido', 401);
    }
    return payload;
  } catch (error) {
    if (error instanceof QrError) throw error;
    throw new QrError('Token de mesa inválido o vencido', 401);
  }
}

function limaNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour);
  return {
    weekday: WEEKDAY[parts.weekday] ?? 0,
    minutes: (hour === 24 ? 0 : hour) * 60 + Number(parts.minute),
  };
}

function clockToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

export function isBranchOpen(schedules: BranchRow['schedules']) {
  if (!schedules?.length) return true;
  const now = limaNow();
  const today = schedules.filter((row) => DAY_INDEX[row.day.trim().toLowerCase()] === now.weekday);
  if (today.length === 0) return true;
  return today.some((row) => {
    if (row.closed) return false;
    const start = clockToMinutes(row.startTime);
    const end = clockToMinutes(row.endTime);
    if (end >= start) return now.minutes >= start && now.minutes <= end;
    return now.minutes >= start || now.minutes <= end;
  });
}

function categoryIsOpen(category: { startTime?: string | null; endTime?: string | null; availableDays?: unknown }) {
  const now = limaNow();
  const days = Array.isArray(category.availableDays) ? category.availableDays.map(Number) : null;
  if (days && !days.includes(now.weekday)) return false;
  if (!category.startTime || !category.endTime) return true;
  const start = clockToMinutes(category.startTime);
  const end = clockToMinutes(category.endTime);
  if (end >= start) return now.minutes >= start && now.minutes <= end;
  return now.minutes >= start || now.minutes <= end;
}

async function planAllowsQr() {
  const [row] = await masterDb
    .select({ features: plans.features })
    .from(tenants)
    .innerJoin(plans, eq(tenants.planId, plans.id))
    .where(eq(tenants.id, getTenantId()))
    .limit(1);
  return row?.features?.pedidoQr === true;
}

async function requirePlan() {
  if (!(await planAllowsQr())) throw new QrError('El plan no incluye pedido por QR', 403);
}

async function loadTable(mesa: string) {
  const db = getTenantDb();
  const [table] = await db.select().from(tables).where(eq(tables.slug, mesa)).limit(1);
  if (!table) throw new QrError('Mesa no encontrada', 404);
  const [branch] = await db.select().from(branches).where(eq(branches.id, table.branchId)).limit(1);
  if (!branch) throw new QrError('Sucursal no encontrada', 404);
  return { table, branch };
}

async function expireIfNeeded(session: typeof tableSessions.$inferSelect) {
  if (session.status !== 'open' || !session.expiresAt || session.expiresAt.getTime() > Date.now()) return session;
  await closeOpenTableSession({ tableId: session.tableId, orderId: session.orderId, reason: 'expired' });
  return { ...session, status: 'expired' as const };
}

async function openSessionForTable(tableId: number) {
  const db = getTenantDb();
  const [session] = await db.select().from(tableSessions).where(and(
    eq(tableSessions.tableId, tableId),
    eq(tableSessions.status, 'open'),
  )).limit(1);
  if (!session) return null;
  const current = await expireIfNeeded(session);
  return current.status === 'open' ? current : null;
}

function orderBlockedReason(branch: BranchRow) {
  if (!branch.qrOrderingEnabled) return 'El pedido por QR está apagado en esta sucursal';
  if (!branch.qrSalesChannelId) return 'La sucursal no tiene canal de venta para la carta QR';
  if (!isBranchOpen(branch.schedules)) return 'La sucursal está fuera de horario';
  return null;
}

async function ensureOpenSession(table: { id: number; branchId: number }, hours: number) {
  const current = await openSessionForTable(table.id);
  if (current) return current;
  const db = getTenantDb();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  try {
    const [created] = await db.insert(tableSessions).values({
      branchId: table.branchId,
      tableId: table.id,
      pinHash: null,
      pinRequired: false,
      expiresAt,
    }).returning();
    return created;
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505') {
      const again = await openSessionForTable(table.id);
      if (again) return again;
    }
    throw error;
  }
}

export async function lookupTable(mesa: string) {
  await requirePlan();
  const { table, branch } = await loadTable(mesa);
  const session = await openSessionForTable(table.id);
  const blocked = orderBlockedReason(branch)
    || (table.statusCode === 'reserved' || table.statusCode === 'disabled' ? 'Esta mesa no está disponible para pedir' : null);
  return {
    table: { id: table.id, name: table.name, branchId: table.branchId, slug: table.slug },
    branch: { id: branch.id, name: branch.name, taxes: branch.taxes },
    canOrder: !blocked,
    orderBlockedReason: blocked,
    pinRequired: false,
    sessionActive: Boolean(session),
  };
}

export async function getQrMenu(mesa: string, categoryId?: number) {
  const lookup = await lookupTable(mesa);
  const { branch } = await loadTable(mesa);
  const menu = await tenantService.getMenu(branch.id);
  const channelId = branch.qrSalesChannelId;
  const categories = menu
    .filter((category) => category.id == null || categoryIsOpen(category))
    .filter((category) => !categoryId || category.id === categoryId)
    .map((category) => ({
      id: category.id,
      name: category.name,
      order: category.order,
      products: (category.products ?? []).map((product: any) => {
        const channelPrice = channelId
          ? (product.channelPrices ?? []).find((price: any) => price.salesChannelId === channelId && price.isActive)
          : null;
        return {
          ...product,
          price: channelPrice?.price ?? product.price,
          discountPrice: channelPrice ? channelPrice.discountPrice : product.discountPrice,
          channelPrices: channelPrice ? [channelPrice] : [],
        };
      }),
    }));
  return { ...lookup, categories };
}

async function assertPin(session: typeof tableSessions.$inferSelect, deviceId: string, pin?: string) {
  if (!session.pinRequired) return;
  const key = `qrpin:${getTenantId()}:${session.id}:${deviceId}`;
  const attempts = await cache.get<number>(key);
  if ((attempts ?? 0) >= 5) throw new QrError('Demasiados intentos de PIN. Espera un minuto.', 429);
  if (!pin || !pinMatches(pin, session.pinHash)) {
    const next = await cache.incr(key);
    if (next === 1) await cache.expire(key, 60);
    throw new QrError('PIN incorrecto', 401);
  }
  await cache.del(key);
}

export async function joinTable(input: { mesa: string; deviceId: string; alias?: string; pin?: string }) {
  const { table, branch } = await loadTable(input.mesa);
  await requirePlan();
  const blocked = orderBlockedReason(branch)
    || (table.statusCode === 'reserved' || table.statusCode === 'disabled' ? 'Esta mesa no está disponible para pedir' : null);
  if (blocked) {
    return {
      token: null,
      canOrder: false,
      orderBlockedReason: blocked,
      table: { id: table.id, name: table.name, branchId: table.branchId },
    };
  }
  const session = await ensureOpenSession(table, branch.qrSessionExpireHours);

  const db = getTenantDb();
  const [existing] = await db.select().from(tableSessionParticipants).where(and(
    eq(tableSessionParticipants.sessionId, session.id),
    eq(tableSessionParticipants.deviceId, input.deviceId),
  )).limit(1);

  let participant = existing;
  if (participant) {
    const [updated] = await db.update(tableSessionParticipants).set({
      alias: input.alias ?? participant.alias,
      leftAt: null,
    }).where(eq(tableSessionParticipants.id, participant.id)).returning();
    participant = updated;
  } else {
    const [created] = await db.insert(tableSessionParticipants).values({
      sessionId: session.id,
      deviceId: input.deviceId,
      alias: input.alias ?? null,
    }).returning();
    participant = created;
  }

  const token = signSession({
    type: TOKEN_TYPE,
    sessionId: session.id,
    participantId: participant.id,
    tableId: table.id,
    tenantId: getTenantId(),
  }, session.expiresAt ?? new Date(Date.now() + branch.qrSessionExpireHours * 60 * 60 * 1000));

  return {
    token,
    canOrder: !blocked,
    orderBlockedReason: blocked,
    state: await buildState(session.id, participant.id),
  };
}

function kitchenStatus(item: { sentToKitchen: boolean; preparedQty: number; quantity: number }) {
  if (item.preparedQty >= item.quantity) return 'listo';
  if (item.sentToKitchen || item.preparedQty > 0) return 'en_cocina';
  return 'recibido';
}

async function buildState(sessionId: number, participantId: number) {
  const db = getTenantDb();
  const [session] = await db.select().from(tableSessions).where(eq(tableSessions.id, sessionId)).limit(1);
  if (!session || session.status !== 'open') throw new QrError('La sesión de la mesa ya cerró', 401);
  const [table] = await db.select().from(tables).where(eq(tables.id, session.tableId)).limit(1);
  const [branch] = await db.select().from(branches).where(eq(branches.id, session.branchId)).limit(1);
  const participants = await db.select().from(tableSessionParticipants).where(and(
    eq(tableSessionParticipants.sessionId, sessionId),
    isNull(tableSessionParticipants.leftAt),
  )).orderBy(asc(tableSessionParticipants.joinedAt));
  const rounds = await db.select().from(tableSessionRounds).where(eq(tableSessionRounds.sessionId, sessionId)).orderBy(asc(tableSessionRounds.createdAt));
  const calls = await db.select().from(waiterCalls).where(eq(waiterCalls.sessionId, sessionId)).orderBy(asc(waiterCalls.openedAt));

  const orderItemIds = rounds.flatMap((round) => round.items.map((item) => item.orderItemId).filter((id): id is number => typeof id === 'number'));
  const lines = orderItemIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.id, orderItemIds))
    : [];
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const aliasByParticipant = new Map(participants.map((person) => [person.id, person.alias]));

  const [order] = session.orderId
    ? await db.select().from(orders).where(eq(orders.id, session.orderId)).limit(1)
    : [undefined];

  const waiterIds = calls.map((call) => call.assignedWaiterId).filter((id): id is number => id != null);
  const waiters = waiterIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, waiterIds))
    : [];
  const waiterName = new Map(waiters.map((waiter) => [waiter.id, waiter.name]));

  return {
    session: {
      id: session.id,
      tableId: session.tableId,
      tableName: table?.name ?? null,
      branchId: session.branchId,
      orderId: session.orderId,
      expiresAt: session.expiresAt,
    },
    me: { id: participantId, alias: aliasByParticipant.get(participantId) ?? null },
    participants: participants.map((person) => ({ id: person.id, alias: person.alias })),
    canOrder: branch ? !orderBlockedReason(branch) : false,
    orderBlockedReason: branch ? orderBlockedReason(branch) : null,
    rounds: rounds.map((round) => ({
      id: round.id,
      participantId: round.participantId,
      alias: aliasByParticipant.get(round.participantId) ?? null,
      status: round.status,
      rejectReason: round.rejectReason,
      createdAt: round.createdAt,
      items: round.items.map((item) => {
        const line = item.orderItemId ? lineById.get(item.orderItemId) : undefined;
        return {
          ...item,
          kitchenStatus: line ? kitchenStatus(line) : null,
          preparedQty: line?.preparedQty ?? 0,
          quantitySent: line?.quantity ?? item.quantity,
        };
      }),
    })),
    calls: calls.map((call) => ({
      id: call.id,
      reason: call.reason,
      note: call.note,
      status: call.status,
      assignedWaiterName: call.assignedWaiterId ? waiterName.get(call.assignedWaiterId) ?? null : null,
      openedAt: call.openedAt,
    })),
    bill: order ? {
      subtotal: order.subtotal,
      total: order.total,
      taxBreakdown: order.taxBreakdown,
    } : null,
  };
}

export async function getSessionState(token: SessionToken) {
  return buildState(token.sessionId, token.participantId);
}

async function requireOpenParticipant(token: SessionToken) {
  const db = getTenantDb();
  const [session] = await db.select().from(tableSessions).where(eq(tableSessions.id, token.sessionId)).limit(1);
  if (!session) throw new QrError('Sesión no encontrada', 404);
  const current = await expireIfNeeded(session);
  if (current.status !== 'open' || current.tableId !== token.tableId) throw new QrError('La sesión de la mesa ya cerró', 401);
  const [participant] = await db.select().from(tableSessionParticipants).where(eq(tableSessionParticipants.id, token.participantId)).limit(1);
  if (!participant || participant.leftAt) throw new QrError('Ya no estás en esta mesa', 401);
  const [branch] = await db.select().from(branches).where(eq(branches.id, current.branchId)).limit(1);
  if (!branch) throw new QrError('Sucursal no encontrada', 404);
  return { session: current, participant, branch };
}

export async function submitRound(token: SessionToken, items: TableSessionRoundItem[]) {
  await requirePlan();
  const { session, participant, branch } = await requireOpenParticipant(token);
  const blocked = orderBlockedReason(branch);
  if (blocked) throw new QrError(blocked, 403);

  const db = getTenantDb();
  const productIds = [...new Set(items.map((item) => item.productId))];
  const rows = await db.select().from(products).where(inArray(products.id, productIds));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const requested = new Map<number, number>();
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product || !product.isActive) throw new QrError('Un producto de la ronda ya no está disponible', 422);
    for (const name of item.alternatives) {
      const found = (product.alternatives ?? []).some((alternative) => alternative.name === name);
      if (!found) throw new QrError(`La alternativa "${name}" no existe en ${product.name}`, 422);
    }
    requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
  }
  for (const [productId, quantity] of requested) {
    assertStockAvailable(byId.get(productId)!, quantity);
  }

  const [round] = await db.insert(tableSessionRounds).values({
    sessionId: session.id,
    participantId: participant.id,
    items,
    status: 'pending',
  }).returning();
  const [table] = await db.select({ statusCode: tables.statusCode }).from(tables).where(eq(tables.id, session.tableId)).limit(1);
  if (!table || table.statusCode === 'available' || table.statusCode === 'dirty') {
    await db.update(tables).set({
      statusCode: 'seated',
      statusUpdatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tables.id, session.tableId));
  }
  notifyQr(session.branchId, session.id, session.tableId, 'pending');
  return { roundId: round.id, state: await buildState(session.id, participant.id) };
}

export async function createWaiterCall(token: SessionToken, reason: 'attention' | 'bill' | 'utensils' | 'other', note?: string) {
  await requirePlan();
  const { session, participant, branch } = await requireOpenParticipant(token);
  const db = getTenantDb();
  const mine = (await db.select().from(waiterCalls).where(and(
    eq(waiterCalls.sessionId, session.id),
    eq(waiterCalls.participantId, participant.id),
  ))).sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())[0];
  if (mine && Date.now() - mine.openedAt.getTime() < branch.qrCallCooldownSeconds * 1000) {
    throw new QrError('Espera un momento antes de volver a llamar', 429);
  }

  if (reason === 'bill') {
    const pending = await db.select({ id: tableSessionRounds.id }).from(tableSessionRounds).where(and(
      eq(tableSessionRounds.sessionId, session.id),
      eq(tableSessionRounds.status, 'pending'),
    )).limit(1);
    if (pending.length) throw new QrError('Hay rondas sin confirmar. El mozo debe aceptarlas antes de la cuenta.', 409);
    await db.update(tables).set({
      statusCode: 'payment_pending',
      statusUpdatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tables.id, session.tableId));
  }

  try {
    const [call] = await db.insert(waiterCalls).values({
      sessionId: session.id,
      branchId: session.branchId,
      tableId: session.tableId,
      participantId: participant.id,
      reason,
      note: note ?? null,
    }).returning();
    notifyQr(session.branchId, session.id, session.tableId, 'pending');
    return { callId: call.id, state: await buildState(session.id, participant.id) };
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505') {
      throw new QrError('Ya hay una llamada abierta con ese motivo', 409);
    }
    throw error;
  }
}

export async function activateTable(tableId: number, userId: number) {
  await requirePlan();
  const db = getTenantDb();
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1);
  if (!table) throw new QrError('Mesa no encontrada', 404);
  const [branch] = await db.select().from(branches).where(eq(branches.id, table.branchId)).limit(1);
  if (!branch?.qrOrderingEnabled) throw new QrError('El pedido por QR está apagado en esta sucursal', 403);
  if (!branch.qrSalesChannelId) throw new QrError('Elige el canal de venta de la carta QR antes de activar la mesa', 422);

  const current = await openSessionForTable(table.id);
  if (current) throw new QrError('La mesa ya tiene una sesión abierta', 409);

  const pin = branch.qrPinRequired ? randomInt(0, 10000).toString().padStart(4, '0') : null;
  const expiresAt = new Date(Date.now() + branch.qrSessionExpireHours * 60 * 60 * 1000);
  let session: typeof tableSessions.$inferSelect;
  try {
    const [created] = await db.insert(tableSessions).values({
      branchId: table.branchId,
      tableId: table.id,
      pinHash: pin ? sealPin(pin) : null,
      pinRequired: branch.qrPinRequired,
      openedById: userId,
      expiresAt,
    }).returning();
    session = created;
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505') {
      throw new QrError('La mesa ya tiene una sesión abierta', 409);
    }
    throw error;
  }

  await db.update(tables).set({
    statusCode: 'seated',
    statusUpdatedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(tables.id, table.id));

  notifyQr(table.branchId, session.id, table.id, 'state');
  return { sessionId: session.id, pin, expiresAt, tableName: table.name };
}

async function resolveCashSession(userId: number, branchId: number) {
  const own = await cashService.getActiveSessionForUserInBranch(userId, branchId);
  if (own) return own;
  const branchSession = await cashService.getActiveSessionForBranch(branchId);
  if (!branchSession) {
    throw new QrError('No se puede aceptar la ronda: no hay una caja con turno abierto en esta sucursal.', 409);
  }
  return branchSession;
}

function pricedItems(rows: Map<number, typeof products.$inferSelect>, items: TableSessionRoundItem[]) {
  return items.map((item) => {
    const product = rows.get(item.productId)!;
    const selectedAlternatives = item.alternatives.map((name) => {
      const found = (product.alternatives ?? []).find((alternative) => alternative.name === name);
      if (!found) throw new QrError(`La alternativa "${name}" no existe en ${product.name}`, 422);
      return { name: found.name, extraPrice: Number(found.extraPrice) };
    });
    return {
      productId: item.productId,
      quantity: item.quantity,
      selectedAlternatives,
      extras: item.extraIds.map((extraId) => ({ extraId, qty: 1 })),
      notes: item.notes?.slice(0, 100) ?? null,
    };
  });
}

export async function acceptRound(roundId: number, userId: number, pax?: { paxAdults?: number; paxChildren?: number }) {
  await requirePlan();
  const db = getTenantDb();
  const [preview] = await db.select({ branchId: tableSessions.branchId }).from(tableSessionRounds)
    .innerJoin(tableSessions, eq(tableSessionRounds.sessionId, tableSessions.id))
    .where(eq(tableSessionRounds.id, roundId))
    .limit(1);
  if (!preview) throw new QrError('La ronda ya fue atendida', 409);
  if (!(await canReceiveQrOrder(preview.branchId, userId))) throw new QrError('No tienes permisos para esta acción', 403);
  const [claimed] = await db.update(tableSessionRounds).set({
    status: 'accepted',
    decidedById: userId,
    decidedAt: new Date(),
  }).where(and(
    eq(tableSessionRounds.id, roundId),
    eq(tableSessionRounds.status, 'pending'),
  )).returning();
  if (!claimed) throw new QrError('La ronda ya fue atendida', 409);

  let wroteOrder = false;
  try {
    const [session] = await db.select().from(tableSessions).where(eq(tableSessions.id, claimed.sessionId)).limit(1);
    if (!session || session.status !== 'open') throw new QrError('La sesión de la mesa ya cerró', 409);
    const [table] = await db.select().from(tables).where(eq(tables.id, session.tableId)).limit(1);
    const [participant] = await db.select().from(tableSessionParticipants).where(eq(tableSessionParticipants.id, claimed.participantId)).limit(1);
    const [branch] = await db.select().from(branches).where(eq(branches.id, session.branchId)).limit(1);
    if (!table || !branch?.qrSalesChannelId) throw new QrError('La sucursal no tiene canal de venta para la carta QR', 422);

    const productIds = [...new Set(claimed.items.map((item) => item.productId))];
    const extraIds = [...new Set(claimed.items.flatMap((item) => item.extraIds))];
    const productRows = await db.select().from(products).where(inArray(products.id, productIds));
    const byId = new Map(productRows.map((row) => [row.id, row]));
    for (const item of claimed.items) {
      const product = byId.get(item.productId);
      if (!product?.isActive) throw new QrError('Un producto de la ronda ya no está disponible', 422);
    }
    if (extraIds.length) {
      const extras = await db.select({ id: productExtras.id }).from(productExtras).where(and(
        inArray(productExtras.id, extraIds),
        eq(productExtras.isActive, true),
      ));
      if (extras.length !== extraIds.length) throw new QrError('Un extra de la ronda ya no está disponible', 422);
    }
    const requested = new Map<number, number>();
    for (const item of claimed.items) requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
    for (const [productId, quantity] of requested) assertStockAvailable(byId.get(productId)!, quantity);

    const payloadItems = pricedItems(byId, claimed.items);
    let orderId = session.orderId;
    const [linked] = orderId
      ? await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
      : [undefined];
    const reusable = linked && !['cancelled', 'completed'].includes(linked.status) && linked.paymentStatus !== 'paid' ? linked : undefined;

    const savedIds: number[] = [];
    if (!reusable) {
      const paxAdults = pax?.paxAdults && pax.paxAdults > 0 ? pax.paxAdults : 1;
      const cashSession = await resolveCashSession(userId, session.branchId);
      const created = await tenantService.createOrder({
        branchId: session.branchId,
        tableId: session.tableId,
        tableName: table.name,
        salesChannelId: branch.qrSalesChannelId,
        waiterId: userId,
        cashSessionId: cashSession.id,
        customerName: participant?.alias || `Mesa ${table.name}`,
        deliveryType: 'dine_in',
        deliveryFee: 0,
        paxAdults,
        paxChildren: pax?.paxChildren ?? 0,
        items: payloadItems,
      }, 'preparing');
      if (!created?.id) throw new QrError('No se pudo crear el pedido de la mesa', 500);
      orderId = created.id;
      wroteOrder = true;
      for (const line of created.items ?? []) savedIds.push(line.id);
      await tenantService.triggerStockDischargeForOrder(created.id);
    } else {
      orderId = reusable.id;
      for (const item of payloadItems) {
        const line = await editOrderItem(orderId, { action: 'add', ...item, notes: item.notes ?? undefined });
        savedIds.push((line as { id: number }).id);
        wroteOrder = true;
      }
      await db.update(tables).set({
        statusCode: 'in_kitchen',
        statusUpdatedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(tables.id, session.tableId));
    }

    const items = claimed.items.map((item, index) => ({ ...item, orderItemId: savedIds[index] }));
    await db.update(tableSessionRounds).set({ items }).where(eq(tableSessionRounds.id, roundId));
    await db.update(tableSessions).set({ orderId, updatedAt: new Date() }).where(eq(tableSessions.id, session.id));
    notifyQr(session.branchId, session.id, session.tableId, 'state');
    return { orderId, itemIds: savedIds };
  } catch (error) {
    if (!wroteOrder) {
      await db.update(tableSessionRounds).set({
        status: 'pending',
        decidedById: null,
        decidedAt: null,
      }).where(eq(tableSessionRounds.id, roundId));
    }
    throw error;
  }
}

export async function rejectRound(roundId: number, userId: number, reason: string) {
  await requirePlan();
  const db = getTenantDb();
  const [round] = await db.update(tableSessionRounds).set({
    status: 'rejected',
    rejectReason: reason,
    decidedById: userId,
    decidedAt: new Date(),
  }).where(and(
    eq(tableSessionRounds.id, roundId),
    eq(tableSessionRounds.status, 'pending'),
  )).returning();
  if (!round) throw new QrError('La ronda ya fue atendida', 409);
  const [session] = await db.select({ branchId: tableSessions.branchId, tableId: tableSessions.tableId }).from(tableSessions).where(eq(tableSessions.id, round.sessionId)).limit(1);
  if (session) notifyQr(session.branchId, round.sessionId, session.tableId, 'state');
  return { roundId: round.id };
}

async function escalateOpenCalls(branchId: number) {
  const db = getTenantDb();
  const [branch] = await db.select({ seconds: branches.qrEscalationSeconds }).from(branches).where(eq(branches.id, branchId)).limit(1);
  const seconds = branch?.seconds ?? 90;
  const limit = new Date(Date.now() - seconds * 1000);
  const openCalls = await db.select().from(waiterCalls).where(and(
    eq(waiterCalls.branchId, branchId),
    eq(waiterCalls.status, 'open'),
  ));
  const late = openCalls.filter((call) => call.openedAt < limit).map((call) => call.id);
  if (!late.length) return;
  await db.update(waiterCalls).set({ status: 'escalated', escalatedAt: new Date() }).where(inArray(waiterCalls.id, late));
}

const WAITER_ROLE_CODES = ['rol_mozo', 'rol_jefe_mozo'];
const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'dispatched'] as const;

async function roleInBranch(userId: number, branchId: number) {
  const db = getTenantDb();
  const [row] = await db.select({ code: roles.code, branchId: userRoles.branchId }).from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId))
    .limit(1);
  if (!row) return null;
  if (row.branchId != null && row.branchId !== branchId) return null;
  return row.code;
}

async function freeWaiterIds(branchId: number) {
  const db = getTenantDb();
  const staff = await db.select({ userId: userRoles.userId, code: roles.code, branchId: userRoles.branchId }).from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(roles.code, WAITER_ROLE_CODES));
  const waiters = staff.filter((person) => person.branchId == null || person.branchId === branchId).map((person) => person.userId);
  if (!waiters.length) return [];
  const busy = await db.select({ waiterId: orders.waiterId }).from(orders).where(and(
    eq(orders.branchId, branchId),
    eq(orders.deliveryType, 'dine_in'),
    inArray(orders.status, [...OPEN_ORDER_STATUSES]),
    inArray(orders.waiterId, waiters),
  ));
  const taken = new Set(busy.map((order) => order.waiterId).filter((id): id is number => id != null));
  return waiters.filter((id) => !taken.has(id));
}

/** Cajeros siempre. Mozos libres. Si no hay mozos libres, todos los mozos. */
export async function canReceiveQrOrder(branchId: number, userId: number) {
  const role = await roleInBranch(userId, branchId);
  if (!role) return false;
  if (role === 'rol_admin' || role === 'rol_admin_local' || role === 'rol_cajero') return true;
  if (!WAITER_ROLE_CODES.includes(role)) return false;
  const free = await freeWaiterIds(branchId);
  if (free.length === 0) return true;
  return free.includes(userId);
}

export async function listPending(branchId: number, userId?: number) {
  await requirePlan();
  await escalateOpenCalls(branchId);
  const db = getTenantDb();
  const seesOrders = !userId || await canReceiveQrOrder(branchId, userId);
  const rounds = await db.select({
    id: tableSessionRounds.id,
    sessionId: tableSessionRounds.sessionId,
    items: tableSessionRounds.items,
    createdAt: tableSessionRounds.createdAt,
    alias: tableSessionParticipants.alias,
    tableId: tableSessions.tableId,
    tableName: tables.name,
  }).from(tableSessionRounds)
    .innerJoin(tableSessions, eq(tableSessionRounds.sessionId, tableSessions.id))
    .innerJoin(tableSessionParticipants, eq(tableSessionRounds.participantId, tableSessionParticipants.id))
    .innerJoin(tables, eq(tableSessions.tableId, tables.id))
    .where(and(
      eq(tableSessions.branchId, branchId),
      eq(tableSessions.status, 'open'),
      eq(tableSessionRounds.status, 'pending'),
    ))
    .orderBy(asc(tableSessionRounds.createdAt));

  const productIds = [...new Set(rounds.flatMap((round) => (round.items ?? []).map((item) => item.productId)))];
  const productRows = productIds.length
    ? await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds))
    : [];
  const productNames = new Map(productRows.map((product) => [product.id, product.name]));
  const namedRounds = rounds.map((round) => ({
    ...round,
    items: (round.items ?? []).map((item) => ({
      ...item,
      name: productNames.get(item.productId) || `Producto #${item.productId}`,
    })),
  }));

  const calls = await db.select({
    id: waiterCalls.id,
    reason: waiterCalls.reason,
    note: waiterCalls.note,
    status: waiterCalls.status,
    tableId: waiterCalls.tableId,
    tableName: tables.name,
    openedAt: waiterCalls.openedAt,
    assignedWaiterId: waiterCalls.assignedWaiterId,
  }).from(waiterCalls)
    .innerJoin(tables, eq(waiterCalls.tableId, tables.id))
    .where(and(
      eq(waiterCalls.branchId, branchId),
      inArray(waiterCalls.status, ['open', 'taken', 'escalated']),
    ))
    .orderBy(asc(waiterCalls.openedAt));

  return { rounds: seesOrders ? namedRounds : [], calls };
}

export async function takeCall(callId: number, userId: number) {
  await requirePlan();
  const db = getTenantDb();
  const [call] = await db.update(waiterCalls).set({
    status: 'taken',
    assignedWaiterId: userId,
    takenAt: new Date(),
  }).where(and(
    eq(waiterCalls.id, callId),
    eq(waiterCalls.status, 'open'),
  )).returning();
  if (!call) {
    const [current] = await db.select().from(waiterCalls).where(eq(waiterCalls.id, callId)).limit(1);
    if (current?.status === 'escalated') {
      const [taken] = await db.update(waiterCalls).set({
        status: 'taken',
        assignedWaiterId: userId,
        takenAt: new Date(),
      }).where(and(eq(waiterCalls.id, callId), eq(waiterCalls.status, 'escalated'))).returning();
      if (taken) {
        notifyQr(taken.branchId, taken.sessionId, taken.tableId, 'pending');
        return { callId: taken.id, status: taken.status };
      }
    }
    throw new QrError('La llamada ya fue tomada', 409);
  }
  const [waiter] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  notifyQr(call.branchId, call.sessionId, call.tableId, 'pending');
  return { callId: call.id, status: call.status, waiterName: waiter?.name ?? null };
}

export async function resolveCall(callId: number, userId: number) {
  await requirePlan();
  const db = getTenantDb();
  const [call] = await db.update(waiterCalls).set({
    status: 'resolved',
    resolvedAt: new Date(),
    assignedWaiterId: userId,
  }).where(and(
    eq(waiterCalls.id, callId),
    inArray(waiterCalls.status, ['open', 'taken', 'escalated']),
  )).returning();
  if (!call) throw new QrError('La llamada ya fue atendida', 409);
  notifyQr(call.branchId, call.sessionId, call.tableId, 'pending');
  return { callId: call.id };
}

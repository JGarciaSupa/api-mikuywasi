import { and, eq, or, ilike, inArray, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  orders,
  cashSessions,
  users,
  userRoles,
  rolePermissions,
  permissionsCatalog,
  userPermissionOverrides,
} from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { getActiveSessionForUser } from './cash.service';
import { resolveForRegister } from '../config-local/activation.service';
import { writeAuditLog } from '../warehouse/shared/audit.service';

const ENABLE_ORDER_TRANSFER = 'ENABLE_ORDER_TRANSFER';
// Permiso que habilita cobrar. Un pedido generado por alguien que puede cobrar NO se
// transfiere: ese usuario (cajero) ya lo cobra directamente.
const CHARGE_PERM = 'pedidos.cambiar_estado_pago';

// Estados en los que un pedido generado puede transferirse a caja (aún operable).
const TRANSFERABLE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'dispatched'] as const;

async function getUserName(userId: number): Promise<string | null> {
  const db = getTenantDb();
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return u?.name ?? null;
}

// Conjunto de userIds que PUEDEN cobrar (efectivo = rol ∪ grant − deny sobre CHARGE_PERM).
// Se usa para excluir de la transferencia los pedidos generados por cajeros.
async function getChargerUserIds(): Promise<Set<number>> {
  const db = getTenantDb();

  const viaRole = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissionsCatalog, and(
      eq(permissionsCatalog.id, rolePermissions.permCatalogId),
      eq(permissionsCatalog.subActionCode, CHARGE_PERM),
    ));

  const viaGrant = await db
    .select({ userId: userPermissionOverrides.userId })
    .from(userPermissionOverrides)
    .innerJoin(permissionsCatalog, and(
      eq(permissionsCatalog.id, userPermissionOverrides.permCatalogId),
      eq(permissionsCatalog.subActionCode, CHARGE_PERM),
    ))
    .where(eq(userPermissionOverrides.type, 'grant'));

  const denies = await db
    .select({ userId: userPermissionOverrides.userId })
    .from(userPermissionOverrides)
    .innerJoin(permissionsCatalog, and(
      eq(permissionsCatalog.id, userPermissionOverrides.permCatalogId),
      eq(permissionsCatalog.subActionCode, CHARGE_PERM),
    ))
    .where(eq(userPermissionOverrides.type, 'deny'));

  const denySet = new Set(denies.map((d) => d.userId));
  const set = new Set<number>();
  for (const r of [...viaRole, ...viaGrant]) {
    if (!denySet.has(r.userId)) set.add(r.userId);
  }
  return set;
}

// userId del GENERADOR del pedido (usuario del turno que lo creó), o null.
async function getGeneratorUserId(orderId: string): Promise<number | null> {
  const db = getTenantDb();
  const [row] = await db
    .select({ userId: cashSessions.userId })
    .from(orders)
    .innerJoin(cashSessions, eq(cashSessions.id, orders.cashSessionId))
    .where(eq(orders.id, orderId));
  return row?.userId ?? null;
}

// Transferir un pedido generado a la caja del cajero (turno abierto). Setea el estado
// de transferencia en el pedido (bloquea la edición) y registra la acción en `audit_log`.
export async function transferOrder(orderId: string, userId: number, ip?: string | null) {
  const db = getTenantDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Pedido ${orderId} no encontrado`);
  if (order.status === 'cancelled' || order.status === 'completed') {
    throw new Error('No se puede transferir un pedido finalizado o cancelado');
  }
  if (order.paymentStatus === 'paid') {
    throw new Error('El pedido ya está cobrado');
  }

  const session = await getActiveSessionForUser(userId);
  if (!session) {
    throw new Error('Necesitas un turno de caja abierto para transferir pedidos');
  }

  // Se puede transferir un pedido de CUALQUIER caja/turno de la MISMA sucursal, pero
  // no de otra sucursal (consistente con el buscador de pedidos transferibles).
  if (order.branchId !== session.branchId) {
    throw new Error('El pedido pertenece a otra sucursal');
  }

  // Si lo generó un cajero (alguien que puede cobrar), no se transfiere: él lo cobra.
  const generatorId = await getGeneratorUserId(orderId);
  if (generatorId != null) {
    const chargers = await getChargerUserIds();
    if (chargers.has(generatorId)) {
      throw new Error('Este pedido lo generó un cajero que puede cobrarlo; no requiere transferencia');
    }
  }

  // Ya transferido: si es a este mismo turno, es idempotente; si es a otro, se bloquea.
  if (order.transferredSessionId != null) {
    if (order.transferredSessionId === session.id) return order;
    throw new Error('El pedido ya fue transferido a otra caja. Debe regresarse primero.');
  }

  if (session.registerId == null) {
    throw new Error('Tu turno no tiene una caja asociada');
  }
  const effective = await resolveForRegister(session.registerId);
  if (!effective[ENABLE_ORDER_TRANSFER]) {
    throw new Error('Las transferencias no están habilitadas para esta caja');
  }

  const [updated] = await db
    .update(orders)
    .set({
      transferredSessionId: session.id,
      transferredById: userId,
      transferredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  await writeAuditLog({
    tableName: 'orders',
    operation: 'UPDATE',
    recordId: null, // orders.id es NanoID (varchar); el id va en la descripción/afterData
    module: 'Pedidos',
    userId,
    userName: await getUserName(userId),
    description: `Transferencia de pedido ${orderId} a la caja (turno ${session.id})`,
    afterData: { orderId, transferredSessionId: session.id, transferredById: userId },
    ipAddress: ip ?? null,
  });

  return updated;
}

// Regresar un pedido transferido: limpia el estado de transferencia (desbloquea) y lo
// registra en `audit_log`.
export async function returnOrder(orderId: string, userId: number, ip?: string | null) {
  const db = getTenantDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Pedido ${orderId} no encontrado`);
  if (order.transferredSessionId == null) {
    throw new Error('El pedido no está transferido');
  }

  const prevSessionId = order.transferredSessionId;

  const [updated] = await db
    .update(orders)
    .set({
      transferredSessionId: null,
      transferredById: null,
      transferredAt: null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  await writeAuditLog({
    tableName: 'orders',
    operation: 'UPDATE',
    recordId: null,
    module: 'Pedidos',
    userId,
    userName: await getUserName(userId),
    description: `Devolución de pedido ${orderId} (regresado del turno ${prevSessionId})`,
    beforeData: { orderId, transferredSessionId: prevSessionId },
    afterData: { orderId, transferredSessionId: null },
    ipAddress: ip ?? null,
  });

  return updated;
}

// Lista para el buscador de transferencias, de la sucursal del turno abierto del cajero:
//   - pedidos NO cobrados, en estados operables,
//   - EXCLUYE los generados por un cajero (él mismo cobra),
//   - INCLUYE los ya transferidos (marcados con transferredSessionId, para mostrarlos
//     deshabilitados y no permitir tomarlos otra vez).
export async function listTransferableOrders(userId: number, search?: string) {
  const db = getTenantDb();

  const session = await getActiveSessionForUser(userId);
  if (!session) return [];

  const conditions = [
    eq(orders.branchId, session.branchId),
    inArray(orders.status, [...TRANSFERABLE_STATUSES]),
    eq(orders.paymentStatus, 'unpaid'),
  ];

  const term = search?.trim();
  if (term) {
    conditions.push(
      or(
        ilike(orders.id, `%${term}%`),
        ilike(orders.trackingCode, `%${term}%`),
        ilike(orders.customerName, `%${term}%`),
        ilike(orders.tableName, `%${term}%`),
      )!
    );
  }

  const genUser = alias(users, 'gen_user');       // mozo/generador
  const xferSession = alias(cashSessions, 'xfer_session'); // turno destino (si transferido)
  const xferUser = alias(users, 'xfer_user');      // cajero que lo tiene

  const rows = await db
    .select({
      id: orders.id,
      trackingCode: orders.trackingCode,
      status: orders.status,
      deliveryType: orders.deliveryType,
      tableName: orders.tableName,
      customerName: orders.customerName,
      total: orders.total,
      createdAt: orders.createdAt,
      transferredSessionId: orders.transferredSessionId,
      generatorUserId: cashSessions.userId,
      generatedByName: genUser.name,     // a quién pertenece (mozo que lo generó)
      transferredToName: xferUser.name,  // en qué caja está (si transferido)
    })
    .from(orders)
    .leftJoin(cashSessions, eq(cashSessions.id, orders.cashSessionId))
    .leftJoin(genUser, eq(genUser.id, cashSessions.userId))
    .leftJoin(xferSession, eq(xferSession.id, orders.transferredSessionId))
    .leftJoin(xferUser, eq(xferUser.id, xferSession.userId))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  // Excluir los generados por un cajero (puede cobrarlos él mismo).
  const chargers = await getChargerUserIds();
  return rows
    .filter((r) => r.generatorUserId == null || !chargers.has(r.generatorUserId))
    .map(({ generatorUserId, ...rest }) => rest);
}

import { orders, orderItems, orderItemExtras, productExtras, customers } from '../../../../../db/tenant/schema';
import { eq, and, desc, asc, sql, count, like, or, gte, lte, inArray } from 'drizzle-orm';
import { getTenantDb, getTenantContext } from '../../../../../utils/tenant-context';
import { recordOrderSaleIncome, getActiveSessionForUser } from './cash.service';
import { findPaymentMethodByName } from '../config-local/payment-method.service';
import type { AuditActor } from '../warehouse/types';
import { restoreProductStockForOrder } from '../../shared/product-stock.service';

const toNum = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value: number) => Number(value.toFixed(2));

export interface GetOrdersFilters {
  page?: number;
  limit?: number;
  status?: string;
  paymentStatus?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  branchId?: number;
  // Si se indica, limita el listado a los pedidos que este usuario GENERÓ o COBRÓ
  // (vía cash_sessions.userId). El controller solo lo pasa cuando el usuario NO
  // tiene el permiso administracion.ver_todos_los_pedidos. Sin él, se ve todo.
  visibilityUserId?: number;
}

/**
 * Obtener listado de órdenes paginado y filtrado
 */
export const getOrders = async (filters: GetOrdersFilters) => {
  const db = getTenantDb();
  const {
    page = 1,
    limit = 10,
    status,
    paymentStatus,
    search,
    startDate,
    endDate,
    branchId,
    visibilityUserId
  } = filters;

  const offset = (page - 1) * limit;

  // Construir condiciones
  const conditions = [];

  if (branchId) {
    conditions.push(eq(orders.branchId, branchId));
  }

  if (status) {
    conditions.push(eq(orders.status, status as any));
  }

  if (paymentStatus) {
    conditions.push(eq(orders.paymentStatus, paymentStatus as any));
  }

  if (startDate) {
    conditions.push(gte(orders.createdAt, new Date(startDate)));
  }

  if (endDate) {
    // Al final del día para incluir las de esa fecha
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(orders.createdAt, end));
  }

  if (search) {
    conditions.push(
      or(
        like(orders.customerName, `%${search}%`),
        like(orders.customerPhone, `%${search}%`),
        like(orders.trackingCode, `%${search}%`)
      )!
    );
  }

  // Visibilidad por usuario: solo los pedidos que generó (cash_session del pedido) o
  // cobró (collected_session), resolviendo cada sesión a su cash_sessions.user_id.
  // Pedidos sin sesión asociada quedan fuera para usuarios restringidos.
  if (visibilityUserId) {
    conditions.push(
      or(
        sql`EXISTS (SELECT 1 FROM cash_sessions cs WHERE cs.id = ${orders.cashSessionId} AND cs.user_id = ${visibilityUserId})`,
        sql`EXISTS (SELECT 1 FROM cash_sessions cs WHERE cs.id = ${orders.collectedSessionId} AND cs.user_id = ${visibilityUserId})`
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const baseQuery = db.select({
    order: orders,
    customer: {
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      firstPhone: sql<string>`(SELECT value FROM customer_contacts WHERE customer_id = ${customers.id} AND contact_type IN ('phone', 'mobile') ORDER BY is_primary DESC LIMIT 1)`,
      firstAddress: sql<string>`(SELECT address FROM customer_addresses WHERE customer_id = ${customers.id} ORDER BY is_default DESC LIMIT 1)`,
      firstReference: sql<string>`(SELECT delivery_instructions FROM customer_addresses WHERE customer_id = ${customers.id} ORDER BY is_default DESC LIMIT 1)`,
    }
  }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id));
  const countQuery = db.select({ total: count() }).from(orders);

  const rawData = await (whereClause
    ? baseQuery.where(whereClause)
    : baseQuery)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(orders.createdAt));

  const data = rawData.map(row => ({
    ...row.order,
    customer: row.customer?.id ? row.customer : null,
  }));

  const [totalResult] = await (whereClause
    ? countQuery.where(whereClause)
    : countQuery);

  const total = totalResult?.total || 0;

  return {
    data,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    }
  };
};

/**
 * Obtener detalle de una orden por ID
 */
export const getOrderById = async (id: string) => {
  const db = getTenantDb();
  const [result] = await db
    .select({
      order: orders,
      customer: {
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        firstPhone: sql<string>`(SELECT value FROM customer_contacts WHERE customer_id = ${customers.id} AND contact_type IN ('phone', 'mobile') ORDER BY is_primary DESC LIMIT 1)`,
        firstAddress: sql<string>`(SELECT address FROM customer_addresses WHERE customer_id = ${customers.id} ORDER BY is_default DESC LIMIT 1)`,
        firstReference: sql<string>`(SELECT delivery_instructions FROM customer_addresses WHERE customer_id = ${customers.id} ORDER BY is_default DESC LIMIT 1)`,
      }
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.id, id)));

  if (!result) return null;

  const order = {
    ...result.order,
    customer: result.customer?.id ? result.customer : null,
  };

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id));

  const itemIds = items.map((i) => i.id);
  const extrasRows = itemIds.length
    ? await db
        .select({
          id: orderItemExtras.id,
          orderItemId: orderItemExtras.orderItemId,
          extraId: orderItemExtras.extraId,
          extraName: productExtras.name,
          qty: orderItemExtras.qty,
          unitPrice: orderItemExtras.unitPrice,
          totalPrice: orderItemExtras.totalPrice,
        })
        .from(orderItemExtras)
        .leftJoin(productExtras, eq(orderItemExtras.extraId, productExtras.id))
        .where(inArray(orderItemExtras.orderItemId, itemIds))
    : [];

  const extrasByItem = new Map<number, typeof extrasRows>();
  for (const row of extrasRows) {
    const list = extrasByItem.get(row.orderItemId) ?? [];
    list.push(row);
    extrasByItem.set(row.orderItemId, list);
  }

  return {
    ...order,
    items: items.map((item) => ({
      ...item,
      extras: extrasByItem.get(item.id) ?? [],
    })),
  };
};

/**
 * Actualizar estado de la orden
 */
export const updateOrderStatus = async (id: string, status: string) => {
  const db = getTenantDb();

  // If order status is updated to 'cancelled', revert the stock discharge
  if (status === 'cancelled') {
    const { reverseDischargeForOrder } = await import('../warehouse/sales-discharge.service');
    await reverseDischargeForOrder(id);
    await restoreProductStockForOrder(db, id);
  }

  const [updated] = await db
    .update(orders)
    .set({
      status: status as any,
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, id)))
    .returning();

  return updated;
};

/**
 * Actualizar el mozo asignado al pedido
 */
export const updateOrderWaiter = async (id: string, waiterId: number | null) => {
  const db = getTenantDb();

  const [updated] = await db
    .update(orders)
    .set({
      waiterId,
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, id)))
    .returning();

  return updated;
};

/**
 * Actualizar estado de pago
 */
export const updateOrderPaymentStatus = async (
  id: string,
  paymentStatus: string,
  paymentMethod?: string,
  retentionPercentage?: number,
  paymentMethodId?: number | null,
  actor?: AuditActor,
) => {
  const db = getTenantDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id)));
  if (!order) return null;

  const wasPaid = order.paymentStatus === 'paid';

  const nextRetentionPercentage = paymentStatus === 'paid'
    ? roundMoney(retentionPercentage ?? toNum(order.retentionPercentage))
    : 0;
  const baseAmount = toNum(order.subtotal) + toNum(order.deliveryFee);
  const retentionAmount = paymentStatus === 'paid'
    ? roundMoney((baseAmount * nextRetentionPercentage) / 100)
    : 0;
  const total = roundMoney(baseAmount + retentionAmount);

  // Al cobrar, el cajero debe tener un turno de caja abierto.
  // El ingreso irá a ese turno (collectedSessionId), no al del mozo (cashSessionId).
  let collectedSessionId: number | undefined;
  if (!wasPaid && paymentStatus === 'paid') {
    const cajeraSession = await getActiveSessionForUser(actor?.userId);
    if (!cajeraSession) {
      throw new Error('Necesitas un turno de caja abierto para cobrar este pedido');
    }
    collectedSessionId = cajeraSession.id;
  }

  // Preferir el id enviado (preciso); si no, resolver por nombre (fallback legacy).
  const resolvedMethodId = paymentMethodId ?? (
    paymentMethod !== undefined ? (await findPaymentMethodByName(paymentMethod))?.id ?? null : null
  );

  const [updated] = await db
    .update(orders)
    .set({
      paymentStatus: paymentStatus as any,
      ...(paymentMethod !== undefined || paymentMethodId !== undefined
        ? { paymentMethod: paymentMethod ?? null, paymentMethodId: resolvedMethodId }
        : {}),
      ...(collectedSessionId !== undefined ? { collectedSessionId } : {}),
      retentionPercentage: nextRetentionPercentage.toFixed(2),
      retentionAmount: retentionAmount.toFixed(2),
      total: total.toFixed(2),
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, id)))
    .returning();

  // Al pasar a PAGADO registrar el ingreso en el turno del cajero (collectedSessionId).
  if (!wasPaid && paymentStatus === 'paid') {
    try {
      await recordOrderSaleIncome(
        id,
        { amount: total, paymentMethod: paymentMethod ?? order.paymentMethod ?? null },
        actor,
      );
    } catch (e) {
      console.error('No se pudo registrar el ingreso de caja para el pedido', id, e);
    }
  }

  return updated;
};

/**
 * Obtener estadísticas básicas para el dashboard
 */
export const getOrderStats = async (branchId?: number) => {
  const db = getTenantDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const conditions = [gte(orders.createdAt, today)];
  const statusConditions = [];

  if (branchId) {
    conditions.push(eq(orders.branchId, branchId));
    statusConditions.push(eq(orders.branchId, branchId));
  }

  // Ventas de hoy (en total)
  const [todayStats] = await db
    .select({
      count: count(),
      totalSales: sql<number>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`
    })
    .from(orders)
    .where(and(...conditions));

  // Conteos por estado
  const statusStats = await db
    .select({
      status: orders.status,
      count: count()
    })
    .from(orders)
    .where(statusConditions.length > 0 ? and(...statusConditions) : undefined)
    .groupBy(orders.status);

  return {
    todaySales: todayStats?.totalSales || 0,
    todayOrders: todayStats?.count || 0,
    byStatus: statusStats.reduce((acc, curr) => {
      acc[curr.status] = curr.count;
      return acc;
    }, {} as Record<string, number>)
  };
};

export const updateOrderCustomer = async (orderId: string, customerId: number | null) => {
  const db = getTenantDb();
  
  if (!customerId) {
    // Si se envía null, desvinculamos al cliente pero mantenemos los datos como "Cliente General" o vacío
    const [updated] = await db
      .update(orders)
      .set({
        customerId: null
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  // Obtenemos los datos del cliente para actualizar el snapshot en el pedido
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId));
    
  if (!customer) {
    throw new Error('Cliente no encontrado');
  }

  const customerName = customer.lastName ? `${customer.firstName} ${customer.lastName}` : customer.firstName;

  const [updated] = await db
    .update(orders)
    .set({
      customerId: customer.id,
      customerName: customerName
    })
    .where(eq(orders.id, orderId))
    .returning();

  return updated;
};

export const updateOrderNotes = async (orderId: string, notes: string | null) => {
  const db = getTenantDb();
  
  const [updated] = await db
    .update(orders)
    .set({
      notes: notes || null
    })
    .where(eq(orders.id, orderId))
    .returning();

  return updated;
};

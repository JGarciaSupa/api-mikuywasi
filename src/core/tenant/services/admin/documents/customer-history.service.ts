import { and, count, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { billingDocuments, branches, customers, orders } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { roundMoney, toNum } from '../warehouse/shared/numbers';

export interface CustomerHistoryFilters {
  page?: number;
  limit?: number;
  startDate?: string; // YYYY-MM-DD (inclusive)
  endDate?: string;   // YYYY-MM-DD (inclusive)
}

/**
 * Consumo de un cliente frecuente en el tiempo: pedidos asociados (orders.customer_id) de
 * todas las sucursales del tenant, sus comprobantes y lo que tiene pendiente por cobrar.
 * Los pedidos anulados no cuentan.
 */
export async function getCustomerHistory(customerId: number, filters: CustomerHistoryFilters = {}) {
  const db = getTenantDb();
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
  if (!customer) return null;

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

  const conditions = [eq(orders.customerId, customerId), ne(orders.status, 'cancelled')];
  if (filters.startDate) conditions.push(gte(orders.createdAt, new Date(`${filters.startDate}T00:00:00`)));
  if (filters.endDate) conditions.push(lte(orders.createdAt, new Date(`${filters.endDate}T23:59:59.999`)));
  const where = and(...conditions);

  const [totals] = await db
    .select({
      orders: count(),
      consumed: sql<string>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.total} else 0 end), 0)`,
      lastVisit: sql<string | null>`max(${orders.createdAt})`,
    })
    .from(orders)
    .where(where);

  // Pendiente por cobrar: comprobantes vigentes marcados "cliente no pagó" y aún no cobrados
  const [pending] = await db
    .select({ count: count(), total: sql<string>`coalesce(sum(${billingDocuments.total}), 0)` })
    .from(billingDocuments)
    .innerJoin(orders, eq(orders.id, billingDocuments.orderId))
    .where(and(
      where,
      eq(billingDocuments.paymentPending, true),
      isNull(billingDocuments.paymentCollectedAt),
      ne(billingDocuments.status, 'voided'),
    ));

  const rows = await db
    .select({
      id: orders.id,
      trackingCode: orders.trackingCode,
      createdAt: orders.createdAt,
      branchName: branches.name,
      total: orders.total,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      paymentMethod: orders.paymentMethod,
    })
    .from(orders)
    .leftJoin(branches, eq(branches.id, orders.branchId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const orderIds = rows.map((r) => r.id);
  const docs = orderIds.length
    ? await db
      .select({
        id: billingDocuments.id,
        orderId: billingDocuments.orderId,
        documentType: billingDocuments.documentType,
        documentNumber: billingDocuments.documentNumber,
        total: billingDocuments.total,
        paymentPending: billingDocuments.paymentPending,
        paymentPendingNote: billingDocuments.paymentPendingNote,
        paymentCollectedAt: billingDocuments.paymentCollectedAt,
        paymentCollectedMethod: billingDocuments.paymentCollectedMethod,
        paymentCollectedReference: billingDocuments.paymentCollectedReference,
      })
      .from(billingDocuments)
      .where(and(
        inArray(billingDocuments.orderId, orderIds),
        eq(billingDocuments.status, 'issued'),
        ne(billingDocuments.documentType, 'nota_de_credito'),
      ))
    : [];

  const totalOrders = Number(totals?.orders ?? 0);
  return {
    summary: {
      orders: totalOrders,
      consumed: roundMoney(toNum(totals?.consumed)).toFixed(2),
      lastVisit: totals?.lastVisit ?? null,
      pendingCount: Number(pending?.count ?? 0),
      pendingTotal: roundMoney(toNum(pending?.total)).toFixed(2),
    },
    data: rows.map((r) => ({ ...r, documents: docs.filter((d) => d.orderId === r.id) })),
    pagination: { total: totalOrders, page, limit, totalPages: Math.ceil(totalOrders / limit) },
  };
}

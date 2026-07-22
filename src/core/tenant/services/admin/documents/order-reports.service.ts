import { orders, orderItems, orderSplits, products, categories, cashSessions, users, billingDocuments } from '../../../../../db/tenant/schema';
import { eq, and, ne, desc, asc, sql, count, gte, lte, notInArray } from 'drizzle-orm';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { resolveRecipeUnitCosts } from '../../client/tenant.service';

const toNum = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value: number) => Number(value.toFixed(2));

// Solo nombres IANA válidos (ej: America/Lima). Evita inyección en AT TIME ZONE.
const TZ_REGEX = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;
const DEFAULT_TZ = 'America/Lima';

export interface OrderReportFilters {
  branchId: number;
  startDate: Date;
  endDate: Date;
  timezone?: string;
  deliveryType?: 'delivery' | 'pickup' | 'dine_in';
  salesChannelId?: number;
  paymentStatus?: 'unpaid' | 'paid' | 'review_pending';
  // 'none' = pedidos sin ningún comprobante emitido
  documentStatus?: 'draft' | 'issued' | 'voided' | 'none';
  granularity?: 'day' | 'hour';
}

const resolveTz = (tz?: string) => (tz && TZ_REGEX.test(tz) ? tz : DEFAULT_TZ);

/**
 * Condiciones comunes del rango/sucursal (SIN condición de estado).
 * Una "venta" excluye canceladas; las canceladas se reportan aparte.
 */
const baseConditions = (f: OrderReportFilters) => {
  const conditions = [
    eq(orders.branchId, f.branchId),
    gte(orders.createdAt, f.startDate),
    lte(orders.createdAt, f.endDate),
  ];
  if (f.deliveryType) conditions.push(eq(orders.deliveryType, f.deliveryType));
  if (f.salesChannelId) conditions.push(eq(orders.salesChannelId, f.salesChannelId));
  if (f.paymentStatus) conditions.push(eq(orders.paymentStatus, f.paymentStatus));
  if (f.documentStatus === 'none') {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM ${billingDocuments}
      WHERE ${billingDocuments.orderId} = ${orders.id}
    )`);
  } else if (f.documentStatus) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${billingDocuments}
      WHERE ${billingDocuments.orderId} = ${orders.id}
        AND ${billingDocuments.status} = ${f.documentStatus}
    )`);
  }
  return conditions;
};

const salesConditions = (f: OrderReportFilters) => [
  ...baseConditions(f),
  ne(orders.status, 'cancelled'),
];

/**
 * Resumen: KPIs + serie temporal + heatmap de horas pico
 */
export const getOrdersReportSummary = async (filters: OrderReportFilters) => {
  const db = getTenantDb();
  const tz = resolveTz(filters.timezone);
  const salesWhere = and(...salesConditions(filters));

  // KPIs de ventas (excluye canceladas)
  const [kpis] = await db
    .select({
      ordersCount: count(),
      totalSales: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
      totalDeliveryFees: sql<string>`COALESCE(SUM(CAST(${orders.deliveryFee} AS DECIMAL)), 0)`,
      totalRetention: sql<string>`COALESCE(SUM(CAST(${orders.retentionAmount} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .where(salesWhere);

  // Canceladas del período (monto que se dejó de vender)
  const [cancelled] = await db
    .select({
      cancelledCount: count(),
      cancelledAmount: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .where(and(...baseConditions(filters), eq(orders.status, 'cancelled')));

  // Unidades vendidas (ítems de pedidos no cancelados)
  const [items] = await db
    .select({
      itemsSold: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(salesWhere);

  // Serie temporal (por día u hora, en la zona horaria del negocio)
  const granularity = filters.granularity ?? 'day';
  const bucketExpr = granularity === 'hour'
    ? sql<string>`to_char(${orders.createdAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD HH24:00')`
    : sql<string>`to_char(${orders.createdAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;

  // GROUP BY 1 (posición): repetir la expresión duplicaría el placeholder
  // de la zona horaria ($1 vs $6) y Postgres las trataría como distintas.
  const series = await db
    .select({
      bucket: bucketExpr,
      ordersCount: count(),
      totalSales: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .where(salesWhere)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  // Heatmap: día de semana (0=domingo) × hora del día
  const dowExpr = sql<number>`EXTRACT(DOW FROM ${orders.createdAt} AT TIME ZONE ${tz})::int`;
  const hourExpr = sql<number>`EXTRACT(HOUR FROM ${orders.createdAt} AT TIME ZONE ${tz})::int`;

  const heatmap = await db
    .select({
      dow: dowExpr,
      hour: hourExpr,
      ordersCount: count(),
      totalSales: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .where(salesWhere)
    .groupBy(sql`1`, sql`2`);

  const totalSales = toNum(kpis?.totalSales);
  const ordersCount = kpis?.ordersCount ?? 0;

  return {
    kpis: {
      totalSales: roundMoney(totalSales),
      ordersCount,
      avgTicket: ordersCount > 0 ? roundMoney(totalSales / ordersCount) : 0,
      itemsSold: toNum(items?.itemsSold),
      totalDeliveryFees: roundMoney(toNum(kpis?.totalDeliveryFees)),
      totalRetention: roundMoney(toNum(kpis?.totalRetention)),
      cancelledCount: cancelled?.cancelledCount ?? 0,
      cancelledAmount: roundMoney(toNum(cancelled?.cancelledAmount)),
    },
    granularity,
    series: series.map((row) => ({
      bucket: row.bucket,
      ordersCount: row.ordersCount,
      totalSales: roundMoney(toNum(row.totalSales)),
    })),
    heatmap: heatmap.map((row) => ({
      dow: row.dow,
      hour: row.hour,
      ordersCount: row.ordersCount,
      totalSales: roundMoney(toNum(row.totalSales)),
    })),
  };
};

/**
 * Desgloses por dimensión: tipo de entrega, canal, método de pago,
 * estado, mozo (turno que generó) y cajero (turno que cobró).
 */
export const getOrdersReportBreakdown = async (filters: OrderReportFilters) => {
  const db = getTenantDb();
  const salesWhere = and(...salesConditions(filters));

  const mapMoneyRows = <T extends { total: string | number; ordersCount: number }>(
    rows: (T & { label: string | null })[],
    fallback: string,
  ) =>
    rows
      .map((row) => ({
        label: row.label || fallback,
        ordersCount: row.ordersCount,
        totalSales: roundMoney(toNum(row.total)),
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

  const byDeliveryType = await db
    .select({
      label: orders.deliveryType,
      ordersCount: count(),
      total: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .where(salesWhere)
    .groupBy(orders.deliveryType);

  const byChannel = await db
    .select({
      label: orders.salesChannelName,
      ordersCount: count(),
      total: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .where(salesWhere)
    .groupBy(orders.salesChannelName);

  // Estados: cuenta TODOS los estados del rango (incluye canceladas)
  const byStatus = await db
    .select({
      label: orders.status,
      ordersCount: count(),
      total: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .where(and(...baseConditions(filters)))
    .groupBy(orders.status);

  // Método de pago considerando cuentas divididas (splits):
  // el método real de un pedido dividido vive en order_splits, no en orders.
  const ordersWithSplits = db
    .select({ orderId: orderSplits.orderId })
    .from(orderSplits);

  const byMethodNoSplit = await db
    .select({
      label: orders.paymentMethod,
      ordersCount: count(),
      total: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .where(and(salesWhere, notInArray(orders.id, ordersWithSplits)))
    .groupBy(orders.paymentMethod);

  const byMethodSplits = await db
    .select({
      label: orderSplits.paymentMethod,
      ordersCount: sql<number>`COUNT(DISTINCT ${orderSplits.orderId})::int`,
      total: sql<string>`COALESCE(SUM(CAST(${orderSplits.total} AS DECIMAL)), 0)`,
    })
    .from(orderSplits)
    .innerJoin(orders, eq(orderSplits.orderId, orders.id))
    .where(salesWhere)
    .groupBy(orderSplits.paymentMethod);

  const methodTotals = new Map<string, { ordersCount: number; totalSales: number }>();
  for (const row of [...byMethodNoSplit, ...byMethodSplits]) {
    const label = row.label || 'Sin especificar';
    const prev = methodTotals.get(label) ?? { ordersCount: 0, totalSales: 0 };
    methodTotals.set(label, {
      ordersCount: prev.ordersCount + toNum(row.ordersCount),
      totalSales: roundMoney(prev.totalSales + toNum(row.total)),
    });
  }
  const byPaymentMethod = [...methodTotals.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.totalSales - a.totalSales);

  // Ventas por mozo: turno que GENERÓ el pedido (cash_session_id → users)
  const bySeller = await db
    .select({
      label: users.name,
      ordersCount: count(),
      total: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .innerJoin(cashSessions, eq(orders.cashSessionId, cashSessions.id))
    .leftJoin(users, eq(cashSessions.userId, users.id))
    .where(salesWhere)
    .groupBy(users.name);

  // Cobros por cajero: turno que COBRÓ el pedido (collected_session_id → users)
  const byCashier = await db
    .select({
      label: users.name,
      ordersCount: count(),
      total: sql<string>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
    })
    .from(orders)
    .innerJoin(cashSessions, eq(orders.collectedSessionId, cashSessions.id))
    .leftJoin(users, eq(cashSessions.userId, users.id))
    .where(and(salesWhere, eq(orders.paymentStatus, 'paid')))
    .groupBy(users.name);

  return {
    byDeliveryType: mapMoneyRows(byDeliveryType, 'Sin tipo'),
    byChannel: mapMoneyRows(byChannel, 'Sin canal'),
    byStatus: byStatus.map((row) => ({
      label: row.label,
      ordersCount: row.ordersCount,
      totalSales: roundMoney(toNum(row.total)),
    })),
    byPaymentMethod,
    bySeller: mapMoneyRows(bySeller, 'Sin asignar'),
    byCashier: mapMoneyRows(byCashier, 'Sin asignar'),
  };
};

/**
 * Productos: top más vendidos y ventas por categoría
 */
export const getOrdersReportProducts = async (filters: OrderReportFilters, limit = 20) => {
  const db = getTenantDb();
  const salesWhere = and(...salesConditions(filters));

  const revenueExpr = sql<string>`COALESCE(SUM(CAST(${orderItems.totalPrice} AS DECIMAL)), 0)`;

  const topProducts = await db
    .select({
      productName: orderItems.productName,
      units: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      revenue: revenueExpr,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(salesWhere)
    .groupBy(orderItems.productName)
    .orderBy(desc(revenueExpr))
    .limit(limit);

  const byCategory = await db
    .select({
      category: categories.name,
      units: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      revenue: revenueExpr,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(salesWhere)
    .groupBy(categories.name)
    .orderBy(desc(revenueExpr));

  return {
    topProducts: topProducts.map((row) => ({
      productName: row.productName,
      units: toNum(row.units),
      revenue: roundMoney(toNum(row.revenue)),
    })),
    byCategory: byCategory.map((row) => ({
      category: row.category || 'Sin categoría',
      units: toNum(row.units),
      revenue: roundMoney(toNum(row.revenue)),
    })),
  };
};

/** Tope de filas del export para no tumbar el server con rangos gigantes */
const EXPORT_MAX_ROWS = 20000;

/**
 * Dataset plano para exportar a Excel: pedidos + detalle de ítems.
 * Incluye canceladas (columna estado) para que el Excel refleje todo el rango.
 */
export const getOrdersReportExport = async (filters: OrderReportFilters) => {
  const db = getTenantDb();
  const whereClause = and(...baseConditions(filters));

  const exportOrders = await db
    .select({
      id: orders.id,
      trackingCode: orders.trackingCode,
      createdAt: orders.createdAt,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      deliveryType: orders.deliveryType,
      salesChannelName: orders.salesChannelName,
      tableName: orders.tableName,
      paymentMethod: orders.paymentMethod,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      subtotal: orders.subtotal,
      deliveryFee: orders.deliveryFee,
      retentionAmount: orders.retentionAmount,
      total: orders.total,
    })
    .from(orders)
    .where(whereClause)
    .orderBy(asc(orders.createdAt))
    .limit(EXPORT_MAX_ROWS);

  const exportItems = await db
    .select({
      orderId: orderItems.orderId,
      trackingCode: orders.trackingCode,
      createdAt: orders.createdAt,
      orderStatus: orders.status,
      customerName: orders.customerName,
      salesChannelName: orders.salesChannelName,
      deliveryType: orders.deliveryType,
      tableName: orders.tableName,
      productId: orderItems.productId,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      unitCost: orderItems.unitCost,
      packagingFee: orderItems.packagingFee,
      totalPrice: orderItems.totalPrice,
      taxSnapshot: orderItems.taxSnapshot,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(whereClause)
    .orderBy(asc(orders.createdAt))
    .limit(EXPORT_MAX_ROWS);

  // Comprobantes por pedido (un pedido puede tener varios: splits, reemisiones, NC)
  const exportDocs = await db
    .select({
      orderId: billingDocuments.orderId,
      documentType: billingDocuments.documentType,
      documentNumber: billingDocuments.documentNumber,
      status: billingDocuments.status,
    })
    .from(billingDocuments)
    .innerJoin(orders, eq(billingDocuments.orderId, orders.id))
    .where(whereClause)
    .orderBy(asc(billingDocuments.id));

  const docsByOrder = new Map<string, { type: string; number: string; status: string }[]>();
  for (const doc of exportDocs) {
    const list = docsByOrder.get(doc.orderId) ?? [];
    list.push({ type: doc.documentType, number: doc.documentNumber, status: doc.status });
    docsByOrder.set(doc.orderId, list);
  }

  // Costo histórico: pedidos anteriores a unit_cost no tienen snapshot; se
  // recalcula con la receta y los precios promedio ACTUALES de los insumos.
  const missingCostProductIds = Array.from(new Set(
    exportItems
      .filter((item) => item.unitCost == null && item.productId != null)
      .map((item) => Number(item.productId)),
  ));
  const fallbackCosts = await resolveRecipeUnitCosts(db, missingCostProductIds);

  const items = exportItems.map(({ taxSnapshot, productId, ...item }) => {
    const unitCost = item.unitCost != null
      ? toNum(item.unitCost)
      : (productId != null ? fallbackCosts.get(Number(productId)) ?? null : null);

    // Neto = total de la línea sin IGV (los precios ya lo incluyen). Sin snapshot
    // de impuestos (pedidos muy antiguos) no se puede saber → null.
    const igvAmount = Array.isArray(taxSnapshot)
      ? roundMoney(
          taxSnapshot
            .filter((tax) => tax.key === 'igv')
            .reduce((sum, tax) => sum + toNum(tax.amount), 0),
        )
      : null;

    return {
      ...item,
      unitCost: unitCost != null ? roundMoney(unitCost) : null,
      igvAmount,
      netTotal: igvAmount != null ? roundMoney(toNum(item.totalPrice) - igvAmount) : null,
    };
  });

  return {
    orders: exportOrders.map((order) => ({
      ...order,
      documents: docsByOrder.get(order.id) ?? [],
    })),
    items,
    truncated: exportOrders.length === EXPORT_MAX_ROWS || exportItems.length === EXPORT_MAX_ROWS,
  };
};

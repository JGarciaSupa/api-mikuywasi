import { billingDocuments, billingDocumentLines, orderItems, orders, users } from '../../../../../db/tenant/schema';
import { eq, and, ne, desc, asc, sql, count, gte, lte, isNull } from 'drizzle-orm';
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

export type BillingSunatFilter = 'ACEPTADO' | 'RECHAZADO' | 'ERROR' | 'SIN_ENVIAR';

export interface BillingReportFilters {
  branchId: number;
  startDate: Date;
  endDate: Date;
  timezone?: string;
  documentType?: 'factura' | 'boleta' | 'nota_de_venta' | 'nota_de_credito';
  seriesId?: number;
  sunatStatus?: BillingSunatFilter;
  currency?: string;
  granularity?: 'day' | 'hour';
}

const resolveTz = (tz?: string) => (tz && TZ_REGEX.test(tz) ? tz : DEFAULT_TZ);

/**
 * Condiciones comunes del rango/sucursal sobre issuedAt (SIN condición de estado).
 * "Facturado" = documentos issued; los anulados se reportan aparte, nunca suman.
 */
const baseConditions = (f: BillingReportFilters, currency?: string) => {
  const conditions = [
    eq(billingDocuments.branchId, f.branchId),
    gte(billingDocuments.issuedAt, f.startDate),
    lte(billingDocuments.issuedAt, f.endDate),
  ];
  if (f.documentType) conditions.push(eq(billingDocuments.documentType, f.documentType));
  if (f.seriesId) conditions.push(eq(billingDocuments.seriesId, f.seriesId));
  if (f.sunatStatus === 'SIN_ENVIAR') {
    conditions.push(isNull(billingDocuments.sunatStatus));
  } else if (f.sunatStatus) {
    conditions.push(eq(billingDocuments.sunatStatus, f.sunatStatus));
  }
  if (currency) conditions.push(eq(billingDocuments.currency, currency));
  return conditions;
};

const issuedConditions = (f: BillingReportFilters, currency?: string) => [
  ...baseConditions(f, currency),
  eq(billingDocuments.status, 'issued'),
];

// Emitidos que suman facturación: issued y que no son nota de crédito
const emittedConditions = (f: BillingReportFilters, currency?: string) => [
  ...issuedConditions(f, currency),
  ne(billingDocuments.documentType, 'nota_de_credito'),
];

/**
 * Monedas presentes en el rango y la moneda efectiva del reporte:
 * la pedida por filtro, o la de mayor cantidad de documentos.
 */
const resolveCurrency = async (filters: BillingReportFilters) => {
  const db = getTenantDb();
  const rows = await db
    .select({ currency: billingDocuments.currency, docs: count() })
    .from(billingDocuments)
    .where(and(...baseConditions(filters)))
    .groupBy(billingDocuments.currency)
    .orderBy(desc(count()));

  const availableCurrencies = rows.map((r) => r.currency);
  const currency =
    filters.currency && availableCurrencies.includes(filters.currency)
      ? filters.currency
      : availableCurrencies[0] ?? 'PEN';

  return { currency, availableCurrencies };
};

/**
 * Resumen: KPIs + serie temporal de facturación
 */
export const getBillingReportSummary = async (filters: BillingReportFilters) => {
  const db = getTenantDb();
  const tz = resolveTz(filters.timezone);
  const { currency, availableCurrencies } = await resolveCurrency(filters);

  const moneySums = {
    total: sql<string>`COALESCE(SUM(CAST(${billingDocuments.total} AS DECIMAL)), 0)`,
    subtotal: sql<string>`COALESCE(SUM(CAST(${billingDocuments.subtotal} AS DECIMAL)), 0)`,
    tax: sql<string>`COALESCE(SUM(CAST(${billingDocuments.taxAmount} AS DECIMAL)), 0)`,
  };

  // Emitidos (facturas, boletas, notas de venta en estado issued)
  const [emitted] = await db
    .select({ docs: count(), ...moneySums })
    .from(billingDocuments)
    .where(and(...emittedConditions(filters, currency)));

  // Notas de crédito emitidas (restan al neto)
  const [creditNotes] = await db
    .select({ docs: count(), total: moneySums.total })
    .from(billingDocuments)
    .where(and(...issuedConditions(filters, currency), eq(billingDocuments.documentType, 'nota_de_credito')));

  // Anulados del rango (no suman; se reportan aparte)
  const [voided] = await db
    .select({ docs: count(), total: moneySums.total })
    .from(billingDocuments)
    .where(and(...baseConditions(filters, currency), eq(billingDocuments.status, 'voided')));

  // Salud SUNAT sobre los emitidos (incluye NC; las notas de venta no van a SUNAT → SIN_ENVIAR)
  const sunatExpr = sql<string>`COALESCE(${billingDocuments.sunatStatus}, 'SIN_ENVIAR')`;
  const sunatRows = await db
    .select({ status: sunatExpr, docs: count() })
    .from(billingDocuments)
    .where(and(...issuedConditions(filters, currency)))
    .groupBy(sql`1`);

  const sunat: Record<string, number> = { ACEPTADO: 0, RECHAZADO: 0, ERROR: 0, SIN_ENVIAR: 0 };
  for (const row of sunatRows) sunat[row.status] = row.docs;

  // Serie temporal de lo facturado (emitidos, sin NC)
  const granularity = filters.granularity ?? 'day';
  const bucketExpr = granularity === 'hour'
    ? sql<string>`to_char(${billingDocuments.issuedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD HH24:00')`
    : sql<string>`to_char(${billingDocuments.issuedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;

  // GROUP BY 1 (posición): repetir la expresión duplicaría el placeholder de la
  // zona horaria y Postgres trataría cada aparición como una expresión distinta.
  const series = await db
    .select({
      bucket: bucketExpr,
      docsCount: count(),
      total: moneySums.total,
    })
    .from(billingDocuments)
    .where(and(...emittedConditions(filters, currency)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const emittedTotal = toNum(emitted?.total);
  const creditNotesTotal = toNum(creditNotes?.total);

  return {
    currency,
    availableCurrencies,
    kpis: {
      emittedCount: emitted?.docs ?? 0,
      emittedTotal: roundMoney(emittedTotal),
      emittedSubtotal: roundMoney(toNum(emitted?.subtotal)),
      taxTotal: roundMoney(toNum(emitted?.tax)),
      creditNotesCount: creditNotes?.docs ?? 0,
      creditNotesTotal: roundMoney(creditNotesTotal),
      netTotal: roundMoney(emittedTotal - creditNotesTotal),
      voidedCount: voided?.docs ?? 0,
      voidedTotal: roundMoney(toNum(voided?.total)),
      sunatAccepted: sunat.ACEPTADO,
      sunatRejected: sunat.RECHAZADO,
      sunatError: sunat.ERROR,
      sunatNotSent: sunat.SIN_ENVIAR,
    },
    granularity,
    series: series.map((row) => ({
      bucket: row.bucket,
      docsCount: row.docsCount,
      total: roundMoney(toNum(row.total)),
    })),
  };
};

/**
 * Desgloses: por tipo de comprobante, serie, estado SUNAT, top clientes y emisor.
 */
export const getBillingReportBreakdown = async (filters: BillingReportFilters) => {
  const db = getTenantDb();
  const { currency } = await resolveCurrency(filters);

  const totalExpr = sql<string>`COALESCE(SUM(CAST(${billingDocuments.total} AS DECIMAL)), 0)`;

  const mapRows = <T extends { total: string; docs: number }>(
    rows: (T & { label: string | null })[],
    fallback: string,
  ) =>
    rows
      .map((row) => ({
        label: row.label || fallback,
        docsCount: row.docs,
        total: roundMoney(toNum(row.total)),
      }))
      .sort((a, b) => b.total - a.total);

  const byDocumentType = await db
    .select({ label: billingDocuments.documentType, docs: count(), total: totalExpr })
    .from(billingDocuments)
    .where(and(...issuedConditions(filters, currency)))
    .groupBy(billingDocuments.documentType);

  const bySeries = await db
    .select({
      label: billingDocuments.series,
      docs: count(),
      total: totalExpr,
      minSequential: sql<number>`MIN(${billingDocuments.sequential})`,
      maxSequential: sql<number>`MAX(${billingDocuments.sequential})`,
    })
    .from(billingDocuments)
    .where(and(...issuedConditions(filters, currency)))
    .groupBy(billingDocuments.series);

  const sunatExpr = sql<string>`COALESCE(${billingDocuments.sunatStatus}, 'SIN_ENVIAR')`;
  const bySunatStatus = await db
    .select({ label: sunatExpr, docs: count(), total: totalExpr })
    .from(billingDocuments)
    .where(and(...issuedConditions(filters, currency)))
    .groupBy(sql`1`);

  // Top clientes por monto facturado (emitidos sin NC)
  const buyerExpr = sql<string>`COALESCE(NULLIF(TRIM(${billingDocuments.buyerName}), ''), 'Cliente sin datos')`;
  const topBuyers = await db
    .select({
      label: buyerExpr,
      buyerDoc: sql<string>`MAX(COALESCE(${billingDocuments.buyerDocNumber}, ''))`,
      docs: count(),
      total: totalExpr,
    })
    .from(billingDocuments)
    .where(and(...emittedConditions(filters, currency)))
    .groupBy(sql`1`)
    .orderBy(desc(totalExpr))
    .limit(10);

  // Emisor: createdBy guarda el username del JWT; se resuelve al nombre real
  // del usuario (users.name) con fallback al username si ya no existe.
  const creatorExpr = sql<string>`COALESCE(${users.name}, ${billingDocuments.createdBy})`;
  const byCreator = await db
    .select({ label: creatorExpr, docs: count(), total: totalExpr })
    .from(billingDocuments)
    .leftJoin(users, eq(users.username, billingDocuments.createdBy))
    .where(and(...emittedConditions(filters, currency)))
    .groupBy(sql`1`);

  return {
    currency,
    byDocumentType: mapRows(byDocumentType, 'Sin tipo'),
    bySeries: bySeries
      .map((row) => ({
        label: row.label || 'Sin serie',
        docsCount: row.docs,
        total: roundMoney(toNum(row.total)),
        minSequential: toNum(row.minSequential),
        maxSequential: toNum(row.maxSequential),
      }))
      .sort((a, b) => b.total - a.total),
    bySunatStatus: mapRows(bySunatStatus, 'Sin estado'),
    topBuyers: topBuyers.map((row) => ({
      label: row.label,
      buyerDoc: row.buyerDoc || null,
      docsCount: row.docs,
      total: roundMoney(toNum(row.total)),
    })),
    byCreator: mapRows(byCreator, 'Sin emisor'),
  };
};

/** Tope de filas del export para no tumbar el server con rangos gigantes */
const EXPORT_MAX_ROWS = 20000;

/**
 * Dataset plano para exportar a Excel: comprobantes + detalle de líneas.
 * Incluye anulados (columna estado) para que el Excel refleje todo el rango.
 */
export const getBillingReportExport = async (filters: BillingReportFilters) => {
  const db = getTenantDb();
  const whereClause = and(...baseConditions(filters));

  const documents = await db
    .select({
      id: billingDocuments.id,
      documentNumber: billingDocuments.documentNumber,
      documentType: billingDocuments.documentType,
      series: billingDocuments.series,
      sequential: billingDocuments.sequential,
      issuedAt: billingDocuments.issuedAt,
      orderId: billingDocuments.orderId,
      buyerDocType: billingDocuments.buyerDocType,
      buyerDocNumber: billingDocuments.buyerDocNumber,
      buyerName: billingDocuments.buyerName,
      subtotal: billingDocuments.subtotal,
      taxAmount: billingDocuments.taxAmount,
      total: billingDocuments.total,
      currency: billingDocuments.currency,
      status: billingDocuments.status,
      sunatStatus: billingDocuments.sunatStatus,
      voidedReason: billingDocuments.voidedReason,
      // Nombre real del emisor; fallback al username guardado si el usuario ya no existe
      createdBy: sql<string | null>`COALESCE(${users.name}, ${billingDocuments.createdBy})`,
    })
    .from(billingDocuments)
    .leftJoin(users, eq(users.username, billingDocuments.createdBy))
    .where(whereClause)
    .orderBy(asc(billingDocuments.issuedAt))
    .limit(EXPORT_MAX_ROWS);

  const exportLines = await db
    .select({
      documentNumber: billingDocuments.documentNumber,
      documentType: billingDocuments.documentType,
      issuedAt: billingDocuments.issuedAt,
      docStatus: billingDocuments.status,
      deliveryType: orders.deliveryType,
      salesChannelName: orders.salesChannelName,
      tableName: orders.tableName,
      orderStatus: orders.status,
      productId: billingDocumentLines.productId,
      productName: billingDocumentLines.productName,
      quantity: billingDocumentLines.quantity,
      unitPrice: billingDocumentLines.unitPrice,
      unitCost: orderItems.unitCost,
      subtotal: billingDocumentLines.subtotal,
      taxAmount: billingDocumentLines.taxAmount,
      lineTotal: billingDocumentLines.lineTotal,
    })
    .from(billingDocumentLines)
    .innerJoin(billingDocuments, eq(billingDocumentLines.documentId, billingDocuments.id))
    .innerJoin(orders, eq(billingDocuments.orderId, orders.id))
    .leftJoin(orderItems, eq(billingDocumentLines.orderItemId, orderItems.id))
    .where(whereClause)
    .orderBy(asc(billingDocuments.issuedAt))
    .limit(EXPORT_MAX_ROWS);

  // Costo histórico: líneas sin snapshot (pedidos anteriores a unit_cost) se
  // recalculan con la receta y los precios promedio ACTUALES de los insumos.
  const missingCostProductIds = Array.from(new Set(
    exportLines
      .filter((line) => line.unitCost == null && line.productId != null)
      .map((line) => Number(line.productId)),
  ));
  const fallbackCosts = await resolveRecipeUnitCosts(db, missingCostProductIds);

  const lines = exportLines.map(({ productId, ...line }) => {
    const unitCost = line.unitCost != null
      ? toNum(line.unitCost)
      : (productId != null ? fallbackCosts.get(Number(productId)) ?? null : null);
    return {
      ...line,
      unitCost: unitCost != null ? roundMoney(unitCost) : null,
    };
  });

  return {
    documents,
    lines,
    truncated: documents.length === EXPORT_MAX_ROWS || lines.length === EXPORT_MAX_ROWS,
  };
};

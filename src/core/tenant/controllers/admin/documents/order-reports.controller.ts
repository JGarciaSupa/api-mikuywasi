import type { Context } from 'hono';
import * as reportsService from '../../../services/admin/documents/order-reports.service';
import type { OrderReportFilters } from '../../../services/admin/documents/order-reports.service';

const DELIVERY_TYPES = ['delivery', 'pickup', 'dine_in'] as const;
const PAYMENT_STATUSES = ['unpaid', 'paid', 'review_pending'] as const;
const DOCUMENT_STATUSES = ['draft', 'issued', 'voided', 'none'] as const;

/**
 * Lee y valida los filtros comunes de todos los endpoints de reportes.
 * Devuelve un string de error si algo es inválido.
 */
const parseFilters = (c: Context): { filters?: OrderReportFilters; error?: string } => {
  const branchId = parseInt(c.req.query('branchId') || '', 10);
  if (isNaN(branchId)) {
    return { error: 'El ID de la sucursal (branchId) es requerido y debe ser numérico' };
  }

  const startDateRaw = c.req.query('startDate');
  const endDateRaw = c.req.query('endDate');
  if (!startDateRaw || !endDateRaw) {
    return { error: 'El rango de fechas (startDate y endDate) es requerido' };
  }

  const startDate = new Date(startDateRaw);
  const endDate = new Date(endDateRaw);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { error: 'startDate o endDate no son fechas válidas' };
  }
  if (startDate > endDate) {
    return { error: 'startDate no puede ser mayor que endDate' };
  }

  const deliveryType = c.req.query('deliveryType');
  if (deliveryType && !DELIVERY_TYPES.includes(deliveryType as any)) {
    return { error: 'deliveryType inválido' };
  }

  const paymentStatus = c.req.query('paymentStatus');
  if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus as any)) {
    return { error: 'paymentStatus inválido' };
  }

  const documentStatus = c.req.query('documentStatus');
  if (documentStatus && !DOCUMENT_STATUSES.includes(documentStatus as any)) {
    return { error: 'documentStatus inválido' };
  }

  const salesChannelIdRaw = c.req.query('salesChannelId');
  const salesChannelId = salesChannelIdRaw ? parseInt(salesChannelIdRaw, 10) : undefined;
  if (salesChannelIdRaw && isNaN(salesChannelId!)) {
    return { error: 'salesChannelId debe ser numérico' };
  }

  const granularity = c.req.query('granularity');
  if (granularity && granularity !== 'day' && granularity !== 'hour') {
    return { error: 'granularity debe ser day u hour' };
  }

  return {
    filters: {
      branchId,
      startDate,
      endDate,
      timezone: c.req.query('timezone'),
      deliveryType: deliveryType as OrderReportFilters['deliveryType'],
      salesChannelId,
      paymentStatus: paymentStatus as OrderReportFilters['paymentStatus'],
      documentStatus: documentStatus as OrderReportFilters['documentStatus'],
      granularity: granularity as OrderReportFilters['granularity'],
    },
  };
};

const handle = (
  fn: (filters: OrderReportFilters, c: Context) => Promise<unknown>,
  errorMessage: string,
) => async (c: Context) => {
  const { filters, error } = parseFilters(c);
  if (error || !filters) {
    return c.json({ success: false, message: error }, 400);
  }
  try {
    const data = await fn(filters, c);
    return c.json({ success: true, data });
  } catch (err: any) {
    console.error(`Error in order reports (${errorMessage}):`, err);
    return c.json({ success: false, message: err.message || errorMessage }, 500);
  }
};

export const getOrdersReportSummaryController = handle(
  (filters) => reportsService.getOrdersReportSummary(filters),
  'Error al obtener el resumen del reporte',
);

export const getOrdersReportBreakdownController = handle(
  (filters) => reportsService.getOrdersReportBreakdown(filters),
  'Error al obtener los desgloses del reporte',
);

export const getOrdersReportProductsController = handle(
  (filters, c) => {
    const limitRaw = parseInt(c.req.query('limit') || '20', 10);
    const limit = isNaN(limitRaw) ? 20 : Math.min(Math.max(limitRaw, 1), 100);
    return reportsService.getOrdersReportProducts(filters, limit);
  },
  'Error al obtener el reporte de productos',
);

export const getOrdersReportExportController = handle(
  (filters) => reportsService.getOrdersReportExport(filters),
  'Error al obtener los datos de exportación',
);

import type { Context } from 'hono';
import * as reportsService from '../../../services/admin/documents/billing-reports.service';
import type { BillingReportFilters } from '../../../services/admin/documents/billing-reports.service';

const DOC_TYPES = ['factura', 'boleta', 'nota_de_venta', 'nota_de_credito'] as const;
const SUNAT_STATUSES = ['ACEPTADO', 'RECHAZADO', 'ERROR', 'SIN_ENVIAR'] as const;

/**
 * Lee y valida los filtros comunes de los endpoints de reportes de facturación.
 */
const parseFilters = (c: Context): { filters?: BillingReportFilters; error?: string } => {
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

  const documentType = c.req.query('documentType');
  if (documentType && !DOC_TYPES.includes(documentType as any)) {
    return { error: 'documentType inválido' };
  }

  const sunatStatus = c.req.query('sunatStatus');
  if (sunatStatus && !SUNAT_STATUSES.includes(sunatStatus as any)) {
    return { error: 'sunatStatus inválido' };
  }

  const seriesIdRaw = c.req.query('seriesId');
  const seriesId = seriesIdRaw ? parseInt(seriesIdRaw, 10) : undefined;
  if (seriesIdRaw && isNaN(seriesId!)) {
    return { error: 'seriesId debe ser numérico' };
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
      documentType: documentType as BillingReportFilters['documentType'],
      seriesId,
      sunatStatus: sunatStatus as BillingReportFilters['sunatStatus'],
      currency: c.req.query('currency'),
      granularity: granularity as BillingReportFilters['granularity'],
    },
  };
};

const handle = (
  fn: (filters: BillingReportFilters, c: Context) => Promise<unknown>,
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
    console.error(`Error in billing reports (${errorMessage}):`, err);
    return c.json({ success: false, message: err.message || errorMessage }, 500);
  }
};

export const getBillingReportSummaryController = handle(
  (filters) => reportsService.getBillingReportSummary(filters),
  'Error al obtener el resumen del reporte',
);

export const getBillingReportBreakdownController = handle(
  (filters) => reportsService.getBillingReportBreakdown(filters),
  'Error al obtener los desgloses del reporte',
);

export const getBillingReportExportController = handle(
  (filters) => reportsService.getBillingReportExport(filters),
  'Error al obtener los datos de exportación',
);

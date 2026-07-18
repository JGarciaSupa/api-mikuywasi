import type { Context } from 'hono';
import * as reportsService from '../../../services/admin/documents/cash-reports.service';
import type { CashReportFilters } from '../../../services/admin/documents/cash-reports.service';

const MOVEMENT_TYPES = ['income', 'expense', 'withdrawal', 'deposit'] as const;

/**
 * Lee y valida los filtros comunes de los endpoints de reportes de caja.
 */
const parseFilters = (c: Context): { filters?: CashReportFilters; error?: string } => {
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

  const registerIdRaw = c.req.query('registerId');
  const registerId = registerIdRaw ? parseInt(registerIdRaw, 10) : undefined;
  if (registerIdRaw && isNaN(registerId!)) {
    return { error: 'registerId debe ser numérico' };
  }

  const userIdRaw = c.req.query('userId');
  const userId = userIdRaw ? parseInt(userIdRaw, 10) : undefined;
  if (userIdRaw && isNaN(userId!)) {
    return { error: 'userId debe ser numérico' };
  }

  return {
    filters: {
      branchId,
      startDate,
      endDate,
      timezone: c.req.query('timezone'),
      registerId,
      userId,
    },
  };
};

const handle = (
  fn: (filters: CashReportFilters, c: Context) => Promise<unknown>,
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
    console.error(`Error in cash reports (${errorMessage}):`, err);
    return c.json({ success: false, message: err.message || errorMessage }, 500);
  }
};

export const getCashReportSummaryController = handle(
  (filters) => reportsService.getCashReportSummary(filters),
  'Error al obtener el resumen del reporte de caja',
);

export const getCashReportSessionsController = handle(
  (filters) => reportsService.getCashReportSessions(filters),
  'Error al obtener los turnos',
);

export const getCashReportMovementsController = handle(
  (filters, c) => {
    const movementType = c.req.query('movementType');
    if (movementType && !MOVEMENT_TYPES.includes(movementType as any)) {
      throw new Error('movementType inválido');
    }
    return reportsService.getCashReportMovements(
      filters,
      movementType as (typeof MOVEMENT_TYPES)[number] | undefined,
    );
  },
  'Error al obtener los movimientos',
);

export const getCashReportExportController = handle(
  (filters) => reportsService.getCashReportExport(filters),
  'Error al obtener los datos de exportación',
);

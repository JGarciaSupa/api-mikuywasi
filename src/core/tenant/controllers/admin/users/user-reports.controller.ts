import type { Context } from 'hono';
import * as reportsService from '../../../services/admin/users/user-reports.service';
import type { UserReportFilters } from '../../../services/admin/users/user-reports.service';

/**
 * Lee y valida los filtros comunes de los endpoints de reportes de usuarios.
 */
const parseFilters = (c: Context): { filters?: UserReportFilters; error?: string } => {
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

  return {
    filters: {
      branchId,
      startDate,
      endDate,
      timezone: c.req.query('timezone'),
    },
  };
};

/**
 * Reporte individual. Sin userId en query → el usuario del token (para /me).
 * Con userId → el usuario indicado (vista admin).
 */
export const getUserReportSummaryController = async (c: Context) => {
  const { filters, error } = parseFilters(c);
  if (error || !filters) {
    return c.json({ success: false, message: error }, 400);
  }

  const userIdRaw = c.req.query('userId');
  let userId: number;
  if (userIdRaw) {
    userId = parseInt(userIdRaw, 10);
    if (isNaN(userId)) {
      return c.json({ success: false, message: 'userId debe ser numérico' }, 400);
    }
  } else {
    const payload = c.get('jwtPayload');
    userId = payload?.userId;
    if (!userId) {
      return c.json({ success: false, message: 'No se pudo identificar al usuario del token' }, 401);
    }
  }

  try {
    const data = await reportsService.getUserReportSummary(userId, filters);
    return c.json({ success: true, data });
  } catch (err: any) {
    console.error('Error in user report summary:', err);
    return c.json({ success: false, message: err.message || 'Error al obtener el reporte del usuario' }, 500);
  }
};

export const getUserReportRankingController = async (c: Context) => {
  const { filters, error } = parseFilters(c);
  if (error || !filters) {
    return c.json({ success: false, message: error }, 400);
  }

  try {
    const data = await reportsService.getUserReportRanking(filters);
    return c.json({ success: true, data });
  } catch (err: any) {
    console.error('Error in user report ranking:', err);
    return c.json({ success: false, message: err.message || 'Error al obtener el ranking de usuarios' }, 500);
  }
};

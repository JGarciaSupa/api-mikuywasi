import type { Context } from 'hono';
import { jsonError } from '@/utils/helpers';
import { hasPermission, getCurrentUserId } from '@/utils/permissions';
import { isSessionParticipant } from '../../../services/admin/documents/cash.service';
import { getCashSessionLiquidation, getCashierLiquidation } from '../../../services/admin/documents/cash-liquidation.service';

/**
 * GET /api/cash/sessions/:id/liquidation?user=
 * Liquidación de cajero del turno (solo lectura). Exige caja.ver_contabilidad y, como el detalle
 * del turno, caja.ver_todos_turnos o ser el cajero/participante del turno.
 */
export const getCashSessionLiquidationController = async (c: Context) => {
  try {
    if (!hasPermission(c, 'caja.ver_contabilidad')) {
      return c.json({ success: false, message: 'No tienes permiso para ver la liquidación de caja' }, 403);
    }
    const id = parseInt(c.req.param('id') || '0');
    if (!id) return c.json({ success: false, message: 'Turno inválido' }, 400);

    const user = c.req.query('user')?.trim() || null;
    const data = await getCashSessionLiquidation(id, user);
    if (!data) return c.json({ success: false, message: 'Sesión no encontrada' }, 404);

    const canSeeAllSessions = hasPermission(c, 'caja.ver_todos_turnos');
    const currentUserId = getCurrentUserId(c);
    if (!canSeeAllSessions && !(await isSessionParticipant(id, currentUserId))) {
      return c.json({ success: false, message: 'No tienes acceso a esta sesión' }, 403);
    }

    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener la liquidación del turno');
  }
};

/**
 * GET /api/cash/liquidation/cashier?userId=&branchId=&from=&to=
 * Todo lo que cobró un cajero en los turnos de la sucursal con actividad en el rango, turno por
 * turno y en total. Exige caja.ver_contabilidad; ver a otro cajero exige caja.ver_todos_turnos.
 */
export const getCashierLiquidationController = async (c: Context) => {
  try {
    if (!hasPermission(c, 'caja.ver_contabilidad')) {
      return c.json({ success: false, message: 'No tienes permiso para ver la liquidación de caja' }, 403);
    }
    const userId = parseInt(c.req.query('userId') || '', 10);
    const branchId = parseInt(c.req.query('branchId') || '', 10);
    const from = new Date(c.req.query('from') || '');
    const to = new Date(c.req.query('to') || '');
    if (isNaN(userId) || isNaN(branchId)) {
      return c.json({ success: false, message: 'Cajero (userId) y sucursal (branchId) son requeridos' }, 400);
    }
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
      return c.json({ success: false, message: 'El rango de fechas (from, to) no es válido' }, 400);
    }
    if (to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
      return c.json({ success: false, message: 'El rango no puede superar 31 días' }, 400);
    }
    if (userId !== getCurrentUserId(c) && !hasPermission(c, 'caja.ver_todos_turnos')) {
      return c.json({ success: false, message: 'Solo puedes ver tu propia liquidación' }, 403);
    }

    const data = await getCashierLiquidation({ userId, branchId, from, to });
    if (!data) return c.json({ success: false, message: 'Cajero no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener la liquidación del cajero');
  }
};

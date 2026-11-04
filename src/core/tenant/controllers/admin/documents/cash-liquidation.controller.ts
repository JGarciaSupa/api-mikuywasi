import type { Context } from 'hono';
import { jsonError } from '@/utils/helpers';
import { hasPermission, getCurrentUserId } from '@/utils/permissions';
import { isSessionParticipant } from '../../../services/admin/documents/cash.service';
import { getCashSessionLiquidation } from '../../../services/admin/documents/cash-liquidation.service';

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

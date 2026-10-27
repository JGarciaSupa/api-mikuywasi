import type { Context } from 'hono';
import * as customerHistoryService from '../../../services/admin/documents/customer-history.service';
import { hasPermission } from '@/utils/permissions';
import { jsonError } from '@/utils/helpers';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /customers/:id/history — consumo del cliente en el tiempo y pendientes por cobrar.
// Muestra importes de venta: mismos permisos que la pantalla Clientes del panel.
export const getCustomerHistoryController = async (c: Context) => {
  try {
    if (!hasPermission(c, 'facturacion.ver_documentos') && !hasPermission(c, 'administracion.configuracion')) {
      return c.json({ success: false, message: 'No tienes permiso para ver el consumo de clientes' }, 403);
    }
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, message: 'ID inválido' }, 400);
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    if ((startDate && !DATE_RE.test(startDate)) || (endDate && !DATE_RE.test(endDate))) {
      return c.json({ success: false, message: 'Las fechas deben tener el formato AAAA-MM-DD' }, 400);
    }
    const result = await customerHistoryService.getCustomerHistory(id, {
      page: Number(c.req.query('page')) || 1,
      limit: Number(c.req.query('limit')) || 20,
      startDate,
      endDate,
    });
    if (!result) return c.json({ success: false, message: 'Cliente no encontrado' }, 404);
    return c.json({ success: true, ...result });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener el consumo del cliente');
  }
};

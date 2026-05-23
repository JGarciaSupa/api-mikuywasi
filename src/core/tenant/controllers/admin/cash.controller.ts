import type { Context } from 'hono';
import * as cash from '../../services/admin/cash.service';
import { getAuditActor, jsonError } from '../../../../utils/helpers';

export const listCashSessions = async (c: Context) => {
  try {
    const data = await cash.listCashSessions({
      status: c.req.query('status'),
      from: c.req.query('from'),
      to: c.req.query('to'),
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar sesiones de caja');
  }
};

export const getCurrentSession = async (c: Context) => {
  try {
    const data = await cash.getCurrentCashSession();
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener sesión actual');
  }
};

export const getCashSessionById = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await cash.getCashSessionById(id);
    if (!data) return c.json({ success: false, message: 'Sesión no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener sesión');
  }
};

export const openCashSession = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await cash.openCashSession(
      { openingBalance: parseFloat(body.openingBalance) || 0, notes: body.notes },
      getAuditActor(c)
    );
    return c.json({ success: true, message: 'Sesión de caja abierta', data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al abrir sesión');
  }
};

export const closeCashSession = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = await cash.closeCashSession(
      id,
      { closingBalance: parseFloat(body.closingBalance) || 0, notes: body.notes },
      getAuditActor(c)
    );
    return c.json({ success: true, message: 'Sesión de caja cerrada', data });
  } catch (e) {
    return jsonError(c, e, 'Error al cerrar sesión');
  }
};

export const addCashMovement = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = await cash.addCashMovement(
      id,
      {
        movementType: body.movementType,
        concept: body.concept,
        amount: parseFloat(body.amount) || 0,
        paymentMethod: body.paymentMethod,
        orderId: body.orderId,
        reference: body.reference,
      },
      getAuditActor(c)
    );
    return c.json({ success: true, message: 'Movimiento registrado', data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al registrar movimiento');
  }
};

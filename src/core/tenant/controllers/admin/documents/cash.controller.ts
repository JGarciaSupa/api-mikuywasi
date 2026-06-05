import type { Context } from 'hono';
import * as cash from '../../../services/admin/documents/cash.service';
import { getAuditActor, jsonError } from '@/utils/helpers';

// ─── Registers CRUD ──────────────────────────────────────────────────────────

export const listCashRegisters = async (c: Context) => {
  try {
    const branchId = c.req.query('branchId') ? parseInt(c.req.query('branchId')!) : undefined;
    const data = await cash.listCashRegisters(branchId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar cajas');
  }
};

export const createCashRegister = async (c: Context) => {
  try {
    const body = await c.req.json();
    if (!body.branchId || !body.name?.trim()) {
      return c.json({ success: false, message: 'Sucursal y nombre son requeridos' }, 400);
    }
    const data = await cash.createCashRegister({
      branchId: parseInt(body.branchId),
      name: body.name.trim(),
    });
    return c.json({ success: true, message: 'Caja creada', data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear caja');
  }
};

export const updateCashRegister = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const body = await c.req.json();
    const data = await cash.updateCashRegister(id, {
      name: body.name?.trim(),
      isActive: body.isActive !== undefined ? !!body.isActive : undefined,
    });
    return c.json({ success: true, message: 'Caja actualizada', data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar caja');
  }
};

// ─── Sessions ───────────────────────────────────────────────────────────────

export const listCashSessions = async (c: Context) => {
  try {
    const registerId = c.req.query('registerId') ? parseInt(c.req.query('registerId')!) : undefined;
    const data = await cash.listCashSessions({
      registerId,
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
    const registerId = c.req.query('registerId') ? parseInt(c.req.query('registerId')!) : undefined;
    const data = await cash.getCurrentCashSession(registerId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener sesión actual');
  }
};

export const getCashSessionById = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
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
    if (!body.registerId) {
      return c.json({ success: false, message: 'Caja (registerId) es requerida' }, 400);
    }
    const data = await cash.openCashSession(
      {
        registerId: parseInt(body.registerId),
        openingBalance: parseFloat(body.openingBalance) || 0,
        notes: body.notes
      },
      getAuditActor(c)
    );
    return c.json({ success: true, message: 'Sesión de caja abierta', data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al abrir sesión');
  }
};

export const closeCashSession = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
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
    const id = parseInt(c.req.param('id') || '0');
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


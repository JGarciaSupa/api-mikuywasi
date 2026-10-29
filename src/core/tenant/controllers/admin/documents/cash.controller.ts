import type { Context } from 'hono';
import * as cash from '../../../services/admin/documents/cash.service';
import { getAuditActor, jsonError } from '@/utils/helpers';
import { hasPermission, getCurrentUserId } from '@/utils/permissions';
import { PlanLimitError } from '../../../services/shared/plan-limits.service';

// Retira los campos contables sensibles de una sesión para usuarios sin caja.ver_contabilidad.
function stripAccountingFields<T extends Record<string, unknown>>(session: T) {
  const { totalIncome, totalExpense, expectedBalance, openingBalance, closingBalance, difference, movements, totalsByMethod, ...safe } = session as any;
  return safe;
}

// ─── Registers CRUD ──────────────────────────────────────────────────────────

export const listCashRegisters = async (c: Context) => {
  try {
    const branchId = c.req.query('branchId') ? parseInt(c.req.query('branchId')!) : undefined;
    const canSeeAccounting = hasPermission(c, 'caja.ver_contabilidad');
    const canSeeAllSessions = hasPermission(c, 'caja.ver_todos_turnos');
    const currentUserId = getCurrentUserId(c);
    const registers = await cash.listCashRegisters(branchId);
    const data = registers.map((reg) => {
      // Los campos contables sensibles (saldos, ingresos, egresos) solo los ve quien tiene
      // permiso de contabilidad (o en su propio turno si es el cajero asignado).
      // Las sesiones abiertas permanecen visibles como metadatos seguros (status, openedBy, code)
      // para que mozos y otros cajeros sepan qué cajas están operativas en la sucursal.
      const sessions = reg.openSessions.map((s) => {
        const canSeeThisSessionAccounting = canSeeAccounting && (canSeeAllSessions || s.userId === currentUserId);
        return canSeeThisSessionAccounting ? s : stripAccountingFields(s);
      });
      return { ...reg, openSessions: sessions };
    });
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
    await cash.assertCanCreateCashRegister();
    const actor = getAuditActor(c);
    const data = await cash.createCashRegister({
      branchId: parseInt(body.branchId),
      name: body.name.trim(),
      userId: actor.userId ?? null, // dueño = usuario que crea la caja (automático)
      exchangeRate: body.exchangeRate !== undefined ? parseFloat(body.exchangeRate) : undefined,
    });
    return c.json({ success: true, message: 'Caja creada', data }, 201);
  } catch (e) {
    if (e instanceof PlanLimitError) return c.json({ success: false, message: e.message }, 400);
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
      exchangeRate: body.exchangeRate !== undefined ? parseFloat(body.exchangeRate) : undefined,
    });
    return c.json({ success: true, message: 'Caja actualizada', data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar caja');
  }
};

export const closeCashRegister = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = await cash.closeCashRegister(id, getAuditActor(c));
    return c.json({ success: true, message: 'Caja cerrada', data });
  } catch (e) {
    return jsonError(c, e, 'Error al cerrar caja');
  }
};

// ─── Sessions ───────────────────────────────────────────────────────────────

export const listCashSessions = async (c: Context) => {
  try {
    const registerId = c.req.query('registerId') ? parseInt(c.req.query('registerId')!) : undefined;
    const canSeeAccounting = hasPermission(c, 'caja.ver_contabilidad');
    const canSeeAllSessions = hasPermission(c, 'caja.ver_todos_turnos');
    const currentUserId = getCurrentUserId(c);
    const sessions = await cash.listCashSessions({
      registerId,
      status: c.req.query('status'),
      from: c.req.query('from'),
      to: c.req.query('to'),
      userId: canSeeAllSessions ? undefined : currentUserId,
    });
    const data = canSeeAccounting ? sessions : sessions.map(stripAccountingFields);
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

export const getMyCashSession = async (c: Context) => {
  try {
    const { userId } = c.get('jwtPayload') ?? {};
    const data = await cash.getActiveSessionForUser(userId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener mi caja activa');
  }
};

export const getCashSessionById = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const session = await cash.getCashSessionById(id);
    if (!session) return c.json({ success: false, message: 'Sesión no encontrada' }, 404);
    const canSeeAllSessions = hasPermission(c, 'caja.ver_todos_turnos');
    const currentUserId = getCurrentUserId(c);
    if (!canSeeAllSessions && session.userId !== currentUserId) {
      return c.json({ success: false, message: 'No tienes acceso a esta sesión' }, 403);
    }
    const canSeeAccounting = hasPermission(c, 'caja.ver_contabilidad');
    const data = canSeeAccounting ? session : stripAccountingFields(session);
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
    const canSetRate = hasPermission(c, 'caja.configurar_tipo_cambio');
    const data = await cash.openCashSession(
      {
        registerId: parseInt(body.registerId),
        openingBalance: parseFloat(body.openingBalance) || 0,
        openingBalanceForeign: parseFloat(body.openingBalanceForeign) || 0,
        // El servicio decide si es obligatorio (sede con moneda extranjera) o si solo
        // se respeta cuando el usuario tiene caja.configurar_tipo_cambio.
        exchangeRate: body.exchangeRate ? parseFloat(body.exchangeRate) : undefined,
        sellExchangeRate: body.sellExchangeRate ? parseFloat(body.sellExchangeRate) : undefined,
        hotelExchangeRate: body.hotelExchangeRate ? parseFloat(body.hotelExchangeRate) : undefined,
        officialExchangeRate: body.officialExchangeRate ? parseFloat(body.officialExchangeRate) : undefined,
        baseCurrency: body.baseCurrency,
        foreignCurrency: body.foreignCurrency,
        allowCustomRate: canSetRate,
        userId: body.userId !== undefined && body.userId !== null ? parseInt(body.userId) : undefined,
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
      { closingBalance: parseFloat(body.closingBalance) || 0, notes: body.notes, password: body.password },
      getAuditActor(c)
    );
    // El service ya escribe su propio registro en audit_log
    c.set('auditLogged', true);
    return c.json({ success: true, message: 'Sesión de caja cerrada', data });
  } catch (e) {
    if (e instanceof cash.OpenOrdersOnCloseError) {
      return c.json({ success: false, message: e.message, requiresAuthorization: true, openOrders: e.openOrders }, 409);
    }
    return jsonError(c, e, 'Error al cerrar sesión');
  }
};

export const refundOrder = async (c: Context) => {
  try {
    const body = await c.req.json();
    if (!body.orderId) return c.json({ success: false, message: 'orderId es requerido' }, 400);
    const data = await cash.refundOrder(
      body.orderId,
      { amount: parseFloat(body.amount) || 0, reason: body.reason },
      getAuditActor(c),
    );
    return c.json({ success: true, message: 'Devolución registrada', data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al registrar la devolución');
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


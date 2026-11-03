import type { Context } from 'hono';
import * as terminals from '../../../services/admin/documents/cash-terminals.service';
import { getAuditActor, jsonError } from '@/utils/helpers';
import { hasPermission } from '@/utils/permissions';
import { getClientIp } from '@/utils/ip';

// Errores de negocio de terminales con su código HTTP; el resto pasa por jsonError.
function terminalError(c: Context, e: unknown, fallback: string) {
  if (e instanceof terminals.CashTerminalError) {
    return c.json({ success: false, message: e.message }, e.status);
  }
  return jsonError(c, e, fallback);
}

// ─── Vinculación de equipos ──────────────────────────────────────────────────

export const createPairingCode = async (c: Context) => {
  try {
    const body = await c.req.json();
    const registerId = parseInt(body.registerId);
    if (!registerId) return c.json({ success: false, message: 'Caja (registerId) es requerida' }, 400);
    const data = await terminals.createPairingCode(registerId, getAuditActor(c));
    c.set('auditLogged', true);
    return c.json({ success: true, message: 'Código de vinculación generado', data }, 201);
  } catch (e) {
    return terminalError(c, e, 'Error al generar el código de vinculación');
  }
};

export const pairTerminal = async (c: Context) => {
  try {
    if (!hasPermission(c, 'caja.abrir_sesion') && !hasPermission(c, 'caja.gestionar_cajas')) {
      return c.json({ success: false, message: 'No tienes permiso para operar caja en este equipo' }, 403);
    }
    const body = await c.req.json();
    const data = await terminals.redeemPairingCode(
      {
        code: typeof body.code === 'string' ? body.code : undefined,
        token: typeof body.token === 'string' ? body.token : undefined,
        deviceName: typeof body.deviceName === 'string' ? body.deviceName : undefined,
      },
      getAuditActor(c),
    );
    c.set('auditLogged', true);
    return c.json({ success: true, message: 'Equipo vinculado a la caja', data }, 201);
  } catch (e) {
    return terminalError(c, e, 'Error al vincular el equipo');
  }
};

export const getCurrentTerminal = async (c: Context) => {
  try {
    const data = await terminals.getTerminalByToken(c.req.header('X-Cash-Terminal'));
    return c.json({ success: true, data });
  } catch (e) {
    return terminalError(c, e, 'Error al consultar el equipo');
  }
};

export const listTerminals = async (c: Context) => {
  try {
    const branchId = c.req.query('branchId') ? parseInt(c.req.query('branchId')!) : undefined;
    const data = await terminals.listTerminals(branchId);
    return c.json({ success: true, data });
  } catch (e) {
    return terminalError(c, e, 'Error al listar equipos');
  }
};

export const revokeTerminal = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    if (!id) return c.json({ success: false, message: 'ID inválido' }, 400);
    await terminals.revokeTerminal(id, getAuditActor(c));
    c.set('auditLogged', true);
    return c.json({ success: true, message: 'Equipo desvinculado' });
  } catch (e) {
    return terminalError(c, e, 'Error al desvincular el equipo');
  }
};

// ─── Autorización remota de cierre ───────────────────────────────────────────

export const createCloseRequest = async (c: Context) => {
  try {
    if (!hasPermission(c, 'caja.cerrar_sesion')) {
      return c.json({ success: false, message: 'No tienes permiso para cerrar turnos' }, 403);
    }
    const body = await c.req.json();
    const sessionId = parseInt(body.sessionId);
    if (!sessionId) return c.json({ success: false, message: 'Sesión (sessionId) es requerida' }, 400);
    const data = await terminals.createCloseRequest(sessionId, getAuditActor(c));
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return terminalError(c, e, 'Error al solicitar la autorización');
  }
};

// Públicos (sin sesión): el supervisor abre el enlace en su celular. El token del enlace identifica la solicitud.
export const getCloseRequest = async (c: Context) => {
  try {
    const data = await terminals.getCloseRequestSummary(c.req.param('token') || '');
    return c.json({ success: true, data });
  } catch (e) {
    return terminalError(c, e, 'Error al consultar la solicitud');
  }
};

export const approveCloseRequest = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await terminals.approveCloseRequest(
      c.req.param('token') || '',
      typeof body.password === 'string' ? body.password : '',
      getClientIp(c),
    );
    c.set('auditLogged', true);
    return c.json({ success: true, message: 'Cierre autorizado', data });
  } catch (e) {
    return terminalError(c, e, 'Error al autorizar el cierre');
  }
};

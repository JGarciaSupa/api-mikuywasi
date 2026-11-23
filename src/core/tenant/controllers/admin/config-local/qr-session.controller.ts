import type { Context } from 'hono';
import { ZodError } from 'zod';
import { safeMessage } from '@/utils/errors';
import { getCurrentUserId, hasPermissionLive } from '@/utils/permissions';
import { QrError } from '../../../services/client/table-session.service';
import * as tableSession from '../../../services/client/table-session.service';
import { acceptRoundSchema, rejectRoundSchema } from '../../../validations/client/table-session.validation';

function fail(c: Context, error: unknown, fallback: string) {
  if (error instanceof QrError) return c.json({ success: false, message: error.message }, error.status);
  if (error instanceof ZodError) return c.json({ success: false, message: error.issues[0]?.message ?? 'Datos inválidos' }, 400);
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Stock insuficiente')) return c.json({ success: false, message }, 422);
  if (message.includes('caja') || message.includes('comensales') || message.includes('canal de venta')) {
    return c.json({ success: false, message }, 409);
  }
  return c.json({ success: false, message: safeMessage(error, fallback) }, 500);
}

async function allow(c: Context, permission: string) {
  if (await hasPermissionLive(c, permission)) return true;
  return c.json({ success: false, message: 'No tienes permisos para esta acción' }, 403);
}

export const activateTableController = async (c: Context) => {
  const denied = await allow(c, 'mozo.activar_mesa_qr');
  if (denied !== true) return denied;
  try {
    const tableId = Number(c.req.param('tableId'));
    const userId = getCurrentUserId(c);
    if (!userId || !Number.isInteger(tableId)) return c.json({ success: false, message: 'Mesa inválida' }, 400);
    const data = await tableSession.activateTable(tableId, userId);
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return fail(c, error, 'No se pudo activar la mesa');
  }
};

export const listPendingController = async (c: Context) => {
  const canRounds = await hasPermissionLive(c, 'mozo.confirmar_rondas_qr');
  const canCalls = await hasPermissionLive(c, 'mozo.atender_llamadas');
  const branchId = Number(c.req.query('branchId'));
  const userId = getCurrentUserId(c);
  const canTake = Number.isInteger(branchId) && userId ? await tableSession.canReceiveQrOrder(branchId, userId) : false;
  if (!canRounds && !canCalls && !canTake) return c.json({ success: false, message: 'No tienes permisos para esta acción' }, 403);
  try {
    if (!Number.isInteger(branchId) || branchId <= 0) return c.json({ success: false, message: 'Sucursal requerida' }, 400);
    return c.json({ success: true, data: await tableSession.listPending(branchId, userId) });
  } catch (error) {
    return fail(c, error, 'No se pudo leer las pendientes');
  }
};

export const acceptRoundController = async (c: Context) => {
  try {
    const userId = getCurrentUserId(c);
    const roundId = Number(c.req.param('id'));
    if (!userId || !Number.isInteger(roundId)) return c.json({ success: false, message: 'Ronda inválida' }, 400);
    const body = acceptRoundSchema.parse(await c.req.json());
    const data = await tableSession.acceptRound(roundId, userId, body);
    return c.json({ success: true, data });
  } catch (error) {
    return fail(c, error, 'No se pudo aceptar la ronda');
  }
};

export const rejectRoundController = async (c: Context) => {
  const denied = await allow(c, 'mozo.confirmar_rondas_qr');
  if (denied !== true) return denied;
  try {
    const userId = getCurrentUserId(c);
    const roundId = Number(c.req.param('id'));
    if (!userId || !Number.isInteger(roundId)) return c.json({ success: false, message: 'Ronda inválida' }, 400);
    const body = rejectRoundSchema.parse(await c.req.json());
    const data = await tableSession.rejectRound(roundId, userId, body.reason);
    return c.json({ success: true, data });
  } catch (error) {
    return fail(c, error, 'No se pudo rechazar la ronda');
  }
};

export const takeCallController = async (c: Context) => {
  const denied = await allow(c, 'mozo.atender_llamadas');
  if (denied !== true) return denied;
  try {
    const userId = getCurrentUserId(c);
    const callId = Number(c.req.param('id'));
    if (!userId || !Number.isInteger(callId)) return c.json({ success: false, message: 'Llamada inválida' }, 400);
    return c.json({ success: true, data: await tableSession.takeCall(callId, userId) });
  } catch (error) {
    return fail(c, error, 'No se pudo tomar la llamada');
  }
};

export const resolveCallController = async (c: Context) => {
  const denied = await allow(c, 'mozo.atender_llamadas');
  if (denied !== true) return denied;
  try {
    const userId = getCurrentUserId(c);
    const callId = Number(c.req.param('id'));
    if (!userId || !Number.isInteger(callId)) return c.json({ success: false, message: 'Llamada inválida' }, 400);
    return c.json({ success: true, data: await tableSession.resolveCall(callId, userId) });
  } catch (error) {
    return fail(c, error, 'No se pudo cerrar la llamada');
  }
};

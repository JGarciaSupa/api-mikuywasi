import type { Context } from 'hono';
import { ZodError } from 'zod';
import { safeMessage } from '@/utils/errors';
import { QrError, readSessionToken } from '../../services/client/table-session.service';
import * as tableSession from '../../services/client/table-session.service';
import { createCallSchema, joinTableSessionSchema, submitRoundSchema } from '../../validations/client/table-session.validation';

function fail(c: Context, error: unknown, fallback: string) {
  if (error instanceof QrError) return c.json({ success: false, message: error.message }, error.status);
  if (error instanceof ZodError) return c.json({ success: false, message: error.issues[0]?.message ?? 'Datos inválidos' }, 400);
  return c.json({ success: false, message: safeMessage(error, fallback) }, 500);
}

export const lookupTableController = async (c: Context) => {
  try {
    const mesa = c.req.query('mesa') ?? '';
    return c.json({ success: true, data: await tableSession.lookupTable(mesa) });
  } catch (error) {
    return fail(c, error, 'No se pudo leer la mesa');
  }
};

export const qrMenuController = async (c: Context) => {
  try {
    const mesa = c.req.query('mesa') ?? '';
    const categoryId = Number(c.req.query('categoryId'));
    const data = await tableSession.getQrMenu(mesa, Number.isInteger(categoryId) && categoryId > 0 ? categoryId : undefined);
    return c.json({ success: true, data });
  } catch (error) {
    return fail(c, error, 'No se pudo leer la carta');
  }
};

export const joinTableController = async (c: Context) => {
  try {
    const body = joinTableSessionSchema.parse(await c.req.json());
    const data = await tableSession.joinTable(body);
    return c.json({ success: true, data });
  } catch (error) {
    return fail(c, error, 'No se pudo entrar a la mesa');
  }
};

export const sessionStateController = async (c: Context) => {
  try {
    const token = readSessionToken(c.req.header('Authorization'));
    return c.json({ success: true, data: await tableSession.getSessionState(token) });
  } catch (error) {
    return fail(c, error, 'No se pudo leer la cuenta');
  }
};

export const submitRoundController = async (c: Context) => {
  try {
    const token = readSessionToken(c.req.header('Authorization'));
    const body = submitRoundSchema.parse(await c.req.json());
    const data = await tableSession.submitRound(token, body.items);
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return fail(c, error, 'No se pudo enviar la ronda');
  }
};

export const createCallController = async (c: Context) => {
  try {
    const token = readSessionToken(c.req.header('Authorization'));
    const body = createCallSchema.parse(await c.req.json());
    const data = await tableSession.createWaiterCall(token, body.reason, body.note);
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return fail(c, error, 'No se pudo llamar al mozo');
  }
};

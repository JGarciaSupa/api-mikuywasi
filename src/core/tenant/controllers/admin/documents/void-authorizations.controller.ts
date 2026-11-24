import type { Context } from 'hono';
import * as voids from '../../../services/admin/documents/void-authorizations.service';
import { getAuditActor, jsonError } from '@/utils/helpers';
import { getClientIp } from '@/utils/ip';

// Errores de negocio con su código HTTP; el resto pasa por jsonError.
function voidAuthError(c: Context, e: unknown, fallback: string) {
  if (e instanceof voids.VoidAuthorizationError) {
    return c.json({ success: false, message: e.message }, e.status);
  }
  return jsonError(c, e, fallback);
}

const VOID_TYPES: voids.VoidType[] = ['order', 'item', 'document'];

// POST /void-authorizations — el cajero o mozo pide autorización remota para anular
export const createVoidRequest = async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const type = body?.type as voids.VoidType;
    if (!VOID_TYPES.includes(type)) return c.json({ success: false, message: 'Tipo de anulación inválido' }, 400);
    const data = await voids.createVoidRequest(
      {
        type,
        orderId: typeof body.orderId === 'string' ? body.orderId : undefined,
        orderItemId: body.orderItemId != null ? Number(body.orderItemId) : undefined,
        documentId: body.documentId != null ? Number(body.documentId) : undefined,
        motivo: typeof body.motivo === 'string' ? body.motivo : undefined,
        quantity: body.quantity != null ? Number(body.quantity) : undefined,
      },
      getAuditActor(c),
    );
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return voidAuthError(c, e, 'Error al solicitar la autorización');
  }
};

// POST /void-authorizations/verify — valida contraseña o código sin consumirlo y devuelve quién autoriza
export const verifyVoidAuthorization = async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const type = body?.type as voids.VoidType;
    if (!VOID_TYPES.includes(type)) return c.json({ success: false, message: 'Tipo de anulación inválido' }, 400);
    const value = typeof body.password === 'string' ? body.password : '';
    const data = await voids.verifyVoidAuthorization(
      {
        type,
        orderId: typeof body.orderId === 'string' ? body.orderId : undefined,
        orderItemId: body.orderItemId != null ? Number(body.orderItemId) : undefined,
        documentId: body.documentId != null ? Number(body.documentId) : undefined,
      },
      { password: value, authCode: typeof body.authCode === 'string' ? body.authCode : undefined },
      getAuditActor(c).userId,
    );
    return c.json({ success: true, data });
  } catch (e) {
    return voidAuthError(c, e, 'Error al validar la autorización');
  }
};

// Públicos (sin sesión): el supervisor abre el enlace en su celular. El token del enlace identifica la solicitud.
export const getVoidRequest = async (c: Context) => {
  try {
    const data = await voids.getVoidRequestSummary(c.req.param('token') || '');
    return c.json({ success: true, data });
  } catch (e) {
    return voidAuthError(c, e, 'Error al consultar la solicitud');
  }
};

export const approveVoidRequest = async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const data = await voids.approveVoidRequest(
      c.req.param('token') || '',
      typeof body.password === 'string' ? body.password : '',
      getClientIp(c),
    );
    c.set('auditLogged', true);
    return c.json({ success: true, message: 'Anulación autorizada', data });
  } catch (e) {
    return voidAuthError(c, e, 'Error al autorizar la anulación');
  }
};

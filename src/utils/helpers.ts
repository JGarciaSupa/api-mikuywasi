import type { Context } from 'hono';
import type { AuditActor } from '../core/tenant/services/admin/warehouse/types';

export function getAuditActor(c: Context): AuditActor {
  const payload = c.get('jwtPayload');
  return {
    userId: payload?.userId,
    ip: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
  };
}

export function parseIdParam(c: Context, param = 'id'): number {
  const raw = c.req.param(param);
  if (raw === undefined || raw === '') {
    throw new Error(`Parámetro "${param}" requerido`);
  }
  const id = parseInt(raw, 10);
  if (isNaN(id)) throw new Error(`ID inválido: ${raw}`);
  return id;
}

export function jsonError(c: Context, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status =
    message.includes('no encontrad') || message.includes('no existe') ? 404
      : message.includes('GENERADO') || message.includes('draft') || message.includes('inválid') ? 400
        : 500;
  return c.json({ success: false, message }, status);
}

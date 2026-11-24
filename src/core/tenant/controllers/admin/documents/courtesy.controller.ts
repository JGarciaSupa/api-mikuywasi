import { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import { getAuditActor } from '@/utils/helpers';
import { hasPermission } from '@/utils/permissions';
import * as courtesyService from '../../../services/admin/documents/courtesy.service';
import type { CourtesyBody } from '../../../validations/admin/config-local/courtesy.validation';

const statusFor = (msg: string) =>
  /Contraseña de autorización inválida|usuario autorizado/i.test(msg) ? 403 : /no encontrado/i.test(msg) ? 404 : 422;

// POST /waiter/orders/:id/courtesy — cortesía de todo el pedido (lo cierra en 0 y emite el documento CT)
export async function giveOrderCourtesyController(c: Context) {
  try {
    const orderId = c.req.param('id');
    if (!orderId) return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    const body = c.req.valid('json' as never) as CourtesyBody;
    const data = await courtesyService.giveOrderCourtesy(orderId, {
      ...body,
      skipPassword: hasPermission(c, 'seguridad.cortesia_sin_contrasena'),
    }, getAuditActor(c));
    c.set('auditLogged', true);
    return c.json({ success: true, data, message: 'Cortesía registrada' });
  } catch (error: any) {
    const msg = safeMessage(error, 'Error al registrar la cortesía');
    return c.json({ success: false, message: msg }, statusFor(msg) as any);
  }
}

// POST /waiter/orders/:id/items/:itemId/courtesy — cortesía de un producto del pedido abierto
export async function giveItemCourtesyController(c: Context) {
  try {
    const orderId = c.req.param('id');
    const itemId = Number(c.req.param('itemId'));
    if (!orderId || !itemId) return c.json({ success: false, message: 'Pedido y producto requeridos' }, 400);
    const body = c.req.valid('json' as never) as CourtesyBody;
    const data = await courtesyService.giveItemCourtesy(orderId, itemId, {
      ...body,
      skipPassword: hasPermission(c, 'seguridad.cortesia_sin_contrasena'),
    }, getAuditActor(c));
    c.set('auditLogged', true);
    return c.json({ success: true, data, message: 'Producto en cortesía' });
  } catch (error: any) {
    const msg = safeMessage(error, 'Error al registrar la cortesía');
    return c.json({ success: false, message: msg }, statusFor(msg) as any);
  }
}

// DELETE /waiter/orders/:id/items/:itemId/courtesy — quita la cortesía del producto
export async function removeItemCourtesyController(c: Context) {
  try {
    const orderId = c.req.param('id');
    const itemId = Number(c.req.param('itemId'));
    if (!orderId || !itemId) return c.json({ success: false, message: 'Pedido y producto requeridos' }, 400);
    const data = await courtesyService.removeItemCourtesy(orderId, itemId, getAuditActor(c));
    c.set('auditLogged', true);
    return c.json({ success: true, data, message: 'Cortesía retirada' });
  } catch (error: any) {
    const msg = safeMessage(error, 'Error al quitar la cortesía');
    return c.json({ success: false, message: msg }, statusFor(msg) as any);
  }
}

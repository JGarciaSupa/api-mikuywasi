import type { Context } from 'hono';
import * as activationService from '../../../services/admin/config-local/activation.service';

function parseRegisterId(raw: string | undefined): number | null {
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

// GET /activations?registerId=X — catálogo + estado efectivo por caja (para el tab).
export const listActivationsController = async (c: Context) => {
  try {
    const registerId = parseRegisterId(c.req.query('registerId'));
    if (registerId === null) {
      return c.json({ success: false, message: 'El parámetro registerId es requerido' }, 400);
    }
    const module = c.req.query('module')?.trim() || undefined;
    const data = await activationService.listForRegister(registerId, module);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener las activaciones' }, 500);
  }
};

// PUT /activations — enciende/apaga una activación para una caja.
export const setActivationController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const registerId = Number(body?.registerId);
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const isEnabled = body?.isEnabled;

    if (!registerId || isNaN(registerId)) {
      return c.json({ success: false, message: 'registerId es requerido' }, 400);
    }
    if (!code) {
      return c.json({ success: false, message: 'code es requerido' }, 400);
    }
    if (typeof isEnabled !== 'boolean') {
      return c.json({ success: false, message: 'isEnabled debe ser booleano' }, 400);
    }

    const data = await activationService.setForRegister(registerId, code, isEnabled);
    return c.json({ success: true, message: 'Activación actualizada', data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la activación' }, 400);
  }
};

// GET /activations/effective?registerId=X — mapa { code: boolean } para el POS.
export const resolveActivationsController = async (c: Context) => {
  try {
    const registerId = parseRegisterId(c.req.query('registerId'));
    if (registerId === null) {
      return c.json({ success: false, message: 'El parámetro registerId es requerido' }, 400);
    }
    const data = await activationService.resolveForRegister(registerId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al resolver las activaciones' }, 500);
  }
};

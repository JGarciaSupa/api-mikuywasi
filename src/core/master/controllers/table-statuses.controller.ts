import type { Context } from 'hono';
import {
  getAllTableStatuses,
  getTableStatusByCode,
  createTableStatus,
  updateTableStatus,
  deleteTableStatus,
} from '../services/table-statuses.service';

export const getAllTableStatusesController = async (c: Context) => {
  try {
    const statuses = await getAllTableStatuses(false);
    return c.json(statuses, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

export const getTableStatusByCodeController = async (c: Context) => {
  try {
    const code = c.req.param('code');
    if (!code) return c.json({ error: 'Se requiere el código del estado' }, 400);
    const status = await getTableStatusByCode(code);
    if (!status) return c.json({ error: 'Estado de mesa no encontrado' }, 404);
    return c.json(status, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

export const createTableStatusController = async (c: Context) => {
  try {
    const body = await c.req.valid('json' as never);
    const created = await createTableStatus(body);
    return c.json({ message: 'Estado de mesa creado', data: created }, 201);
  } catch (error: any) {
    if (error.message.includes('Ya existe')) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: error.message }, 500);
  }
};

export const updateTableStatusController = async (c: Context) => {
  try {
    const code = c.req.param('code');
    if (!code) return c.json({ error: 'Se requiere el código del estado' }, 400);
    const body = await c.req.valid('json' as never);
    const updated = await updateTableStatus(code, body);
    if (!updated) return c.json({ error: 'Estado de mesa no encontrado' }, 404);
    return c.json({ message: 'Estado de mesa actualizado', data: updated }, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

export const deleteTableStatusController = async (c: Context) => {
  try {
    const code = c.req.param('code');
    if (!code) return c.json({ error: 'Se requiere el código del estado' }, 400);
    const deleted = await deleteTableStatus(code);
    if (!deleted) return c.json({ error: 'Estado de mesa no encontrado' }, 404);
    return c.json({ message: 'Estado de mesa eliminado', data: deleted }, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

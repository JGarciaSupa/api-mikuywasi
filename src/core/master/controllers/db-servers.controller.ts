import type { Context } from 'hono';
import * as dbServersService from '../services/db-servers.service';

export const getAllDbServersController = async (c: Context) => {
  try {
    const result = await dbServersService.getAllDbServers();
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener servidores' }, 500);
  }
};

export const getDbServerByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await dbServersService.getDbServerById(id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Servidor no encontrado' }, 404);
  }
};

export const createDbServerController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await dbServersService.createDbServer(data);
    return c.json({ success: true, message: 'Servidor registrado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el servidor' }, 400);
  }
};

export const updateDbServerController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await dbServersService.updateDbServer(id, data);
    return c.json({ success: true, message: 'Servidor actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el servidor' }, 400);
  }
};

export const deleteDbServerController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await dbServersService.deleteDbServer(id);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el servidor' }, 400);
  }
};

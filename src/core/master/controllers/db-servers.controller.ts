import type { Context } from 'hono';
import * as dbServersService from '../services/db-servers.service';
//Lobito Consulting!!
export const getAllDbServersController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const name = c.req.query('name') || undefined;
    const isActiveStr = c.req.query('isActive');
    const isActive = isActiveStr !== undefined ? isActiveStr === 'true' : undefined;

    const result = await dbServersService.getAllDbServers(page, limit, { name, isActive });

    return c.json({
      success: true,
      message: 'Servidores obtenidos con éxito',
      data: {
        list: result.data,
        meta: result.meta,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener servidores', data: null }, 500);
  }
};

export const getDbServerByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await dbServersService.getDbServerById(id);
    return c.json({ success: true, message: 'Servidor obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Servidor no encontrado', data: null }, 404);
  }
};

export const createDbServerController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await dbServersService.createDbServer(data);
    return c.json({ success: true, message: 'Servidor registrado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el servidor', data: null }, 400);
  }
};

export const updateDbServerController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await dbServersService.updateDbServer(id, data);
    return c.json({ success: true, message: 'Servidor actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el servidor', data: null }, 400);
  }
};

export const deleteDbServerController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await dbServersService.deleteDbServer(id);
    return c.json({ success: true, message: result.message || 'Servidor eliminado correctamente', data: null });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el servidor', data: null }, 400);
  }
};

import type { Context } from 'hono';
import { 
  createTable, 
  deleteTable, 
  getAllTables, 
  getTableById, 
  updateTable 
} from '../../services/admin/tables.service';

/**
 * Obtener todas las mesas de un tenant
 */
export const getAllTablesController = async (c: Context) => {
  try {const results = await getAllTables();
    return c.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener las mesas'
    }, 500);
  }
};

/**
 * Crear una nueva mesa
 */
export const createTableController = async (c: Context) => {
  try {
    const { name } = c.req.valid('json' as never);
    
    const result = await createTable({ name });
    
    return c.json({
      success: true,
      message: 'Mesa creada con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear la mesa'
    }, 400);
  }
};

/**
 * Actualizar una mesa
 */
export const updateTableController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de mesa requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de mesa inválido' }, 400);
    }

    const { name } = c.req.valid('json' as never);

    const result = await updateTable(id, { name });
    
    if (!result) {
      return c.json({ success: false, message: 'Mesa no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Mesa actualizada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar la mesa'
    }, 400);
  }
};

/**
 * Eliminar una mesa
 */
export const deleteTableController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de mesa requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de mesa inválido' }, 400);
    }

    const result = await deleteTable(id);
    if (!result) {
      return c.json({ success: false, message: 'Mesa no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Mesa eliminada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar la mesa'
    }, 400);
  }
};

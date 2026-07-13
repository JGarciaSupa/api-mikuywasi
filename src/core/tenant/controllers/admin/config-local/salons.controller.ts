import type { Context } from 'hono';
import {
  createSalon,
  deleteSalon,
  getAllSalons,
  updateSalon
} from '../../../services/admin/config-local/salons.service';

/**
 * Obtener los salones de una sucursal
 */
export const getAllSalonsController = async (c: Context) => {
  try {
    const branchIdQuery = c.req.query('branchId');
    const branchId = branchIdQuery ? parseInt(branchIdQuery, 10) : NaN;
    if (!branchIdQuery || isNaN(branchId)) {
      return c.json({ success: false, message: 'El parámetro branchId es requerido' }, 400);
    }
    const results = await getAllSalons(branchId);
    return c.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener los salones'
    }, 500);
  }
};

/**
 * Crear un nuevo salón
 */
export const createSalonController = async (c: Context) => {
  try {
    const { name, branchId } = c.req.valid('json' as never) as { name: string; branchId: number };

    const result = await createSalon({ name, branchId });

    return c.json({
      success: true,
      message: 'Salón creado con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear el salón'
    }, 400);
  }
};

/**
 * Actualizar un salón
 */
export const updateSalonController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ success: false, message: 'ID de salón requerido' }, 400);
    }

    const { name } = c.req.valid('json' as never) as { name: string };

    const result = await updateSalon(id, { name });

    if (!result) {
      return c.json({ success: false, message: 'Salón no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: 'Salón actualizado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el salón'
    }, 400);
  }
};

/**
 * Eliminar un salón (sus mesas quedan sin salón, no se eliminan)
 */
export const deleteSalonController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ success: false, message: 'ID de salón requerido' }, 400);
    }

    const result = await deleteSalon(id);
    if (!result) {
      return c.json({ success: false, message: 'Salón no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: 'Salón eliminado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar el salón'
    }, 400);
  }
};

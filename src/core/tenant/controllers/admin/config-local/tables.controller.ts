import type { Context } from 'hono';
import { safeMessage, InUseError } from '@/utils/errors';
import {
  createTable,
  deleteTable,
  getAllTables,
  getTableById,
  updateTable,
  updateTablePosition,
  updateTableStatus
} from '../../../services/admin/config-local/tables.service';
import { getAllTableStatuses } from '@/core/master/services/table-statuses.service';
import { bulkCreateTables } from '../../../services/admin/config-local/tables-bulk.service';
import type { BulkCreateTablesInput } from '../../../validations/admin/config-local/tables.validation';



/**
 * Obtener las mesas de una sucursal
 */
export const getAllTablesController = async (c: Context) => {
  try {
    const branchIdQuery = c.req.query('branchId');
    const branchId = branchIdQuery ? parseInt(branchIdQuery, 10) : NaN;
    if (!branchIdQuery || isNaN(branchId)) {
      return c.json({ success: false, message: 'El parámetro branchId es requerido' }, 400);
    }
    const results = await getAllTables(branchId);
    return c.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: safeMessage(error, 'Error al obtener las mesas')
    }, 500);
  }
};

/**
 * Crear una nueva mesa
 */
export const createTableController = async (c: Context) => {
  try {
    const { name, branchId, capacity, shape, salonId } = c.req.valid('json' as never) as { name: string; branchId: number; capacity?: number; shape?: 'square' | 'round'; salonId: string };

    const result = await createTable({ name, branchId, capacity, shape, salonId });

    return c.json({
      success: true,
      message: 'Mesa creada con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: safeMessage(error, 'Error al crear la mesa')
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

    const { name, capacity, shape, salonId } = c.req.valid('json' as never) as { name: string; capacity?: number; shape?: 'square' | 'round'; salonId?: string | null };

    const result = await updateTable(id, { name, capacity, shape, salonId });

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
      message: safeMessage(error, 'Error al actualizar la mesa')
    }, 400);
  }
};

/**
 * Actualizar solo la posición de una mesa (arrastrar y soltar en el mapa)
 */
export const updateTablePositionController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de mesa requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de mesa inválido' }, 400);
    }

    const { posX, posY } = c.req.valid('json' as never) as { posX: number; posY: number };

    const result = await updateTablePosition(id, { posX, posY });

    if (!result) {
      return c.json({ success: false, message: 'Mesa no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Posición actualizada',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: safeMessage(error, 'Error al actualizar la posición de la mesa')
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

    const force = c.req.query('force') === 'true';
    const result = await deleteTable(id, force);
    if (!result) {
      return c.json({ success: false, message: 'Mesa no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Mesa eliminada con éxito',
      data: result
    });
  } catch (error: any) {
    if (error instanceof InUseError) {
      return c.json({
        success: false,
        requiresConfirmation: true,
        references: error.references,
        message: error.message
      }, 409);
    }
    return c.json({
      success: false,
      message: safeMessage(error, 'Error al eliminar la mesa')
    }, 400);
  }
};

/**
 * Actualizar el estado operativo o administrativo de una mesa en tiempo real
 */
export const updateTableStatusController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de mesa requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de mesa inválido' }, 400);
    }

    const { statusCode, reservationNote } = c.req.valid('json' as never) as { statusCode: string; reservationNote?: string | null };

    const result = await updateTableStatus(id, statusCode, reservationNote);

    if (!result) {
      return c.json({ success: false, message: 'Mesa no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Estado de mesa actualizado',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: safeMessage(error, 'Error al actualizar el estado de la mesa')
    }, 400);
  }
};

/**
 * Obtener el catálogo oficial de estados de mesa desde DB Master
 */
export const getTableStatusesController = async (c: Context) => {
  try {
    const statuses = await getAllTableStatuses();
    return c.json({
      success: true,
      data: statuses
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: safeMessage(error, 'Error al obtener los estados de mesa')
    }, 500);
  }
};

export const bulkCreateTablesController = async (c: Context) => {
  try {
    const input = c.req.valid('json' as never) as BulkCreateTablesInput;
    const result = await bulkCreateTables(input);
    if (input.dryRun) return c.json({ success: true, data: result });
    if (result.created === 0) {
      return c.json({ success: true, message: 'No se creó ninguna mesa: todos esos nombres ya existen en la sucursal', data: result });
    }
    return c.json({
      success: true,
      message: result.created === 1 ? '1 mesa creada con éxito' : `${result.created} mesas creadas con éxito`,
      data: result,
    }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al crear las mesas') }, 400);
  }
};

import type { Context } from 'hono';
import {
  createExchangeRate,
  deleteExchangeRate,
  getAllExchangeRates,
  getExchangeRateById,
  updateExchangeRate
} from '../../../services/admin/config-local/exchange-rate.service';

export const getAllExchangeRatesController = async (c: Context) => {
  try {
    const branchIdStr = c.req.query('branchId');
    const branchId = branchIdStr ? parseInt(branchIdStr) : undefined;
    
    if (branchIdStr && isNaN(branchId as number)) {
      return c.json({ success: false, message: 'branchId inválido' }, 400);
    }

    const results = await getAllExchangeRates(branchId);
    return c.json({ success: true, data: results });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener los tipos de cambio' }, 500);
  }
};

export const getExchangeRateByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') as string);
    if (isNaN(id)) return c.json({ success: false, message: 'ID inválido' }, 400);

    const result = await getExchangeRateById(id);
    if (!result) return c.json({ success: false, message: 'Tipo de cambio no encontrado' }, 404);

    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener el tipo de cambio' }, 500);
  }
};

export const createExchangeRateController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await createExchangeRate(data);
    return c.json({ success: true, message: 'Tipo de cambio creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el tipo de cambio' }, 400);
  }
};

export const updateExchangeRateController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') as string);
    if (isNaN(id)) return c.json({ success: false, message: 'ID inválido' }, 400);

    const data = c.req.valid('json' as never);
    const result = await updateExchangeRate(id, data);

    if (!result) return c.json({ success: false, message: 'Tipo de cambio no encontrado' }, 404);
    return c.json({ success: true, message: 'Tipo de cambio actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el tipo de cambio' }, 400);
  }
};

export const deleteExchangeRateController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') as string);
    if (isNaN(id)) return c.json({ success: false, message: 'ID inválido' }, 400);

    const result = await deleteExchangeRate(id);
    if (!result) return c.json({ success: false, message: 'Tipo de cambio no encontrado' }, 404);

    return c.json({ success: true, message: 'Tipo de cambio eliminado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el tipo de cambio' }, 400);
  }
};

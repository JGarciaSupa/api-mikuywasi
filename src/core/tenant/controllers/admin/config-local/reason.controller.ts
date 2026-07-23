import type { Context } from 'hono';
import * as reasonService from '../../../services/admin/config-local/reason.service';

type ReasonType = 'courtesy' | 'order_cancel' | 'document_void' | 'discount';
const VALID_TYPES: ReasonType[] = ['courtesy', 'order_cancel', 'document_void', 'discount'];

export const listReasonsController = async (c: Context) => {
  try {
    const branchIdQuery = c.req.query('branchId');
    const branchId = branchIdQuery ? parseInt(branchIdQuery, 10) : NaN;
    if (!branchIdQuery || isNaN(branchId)) {
      return c.json({ success: false, message: 'El parámetro branchId es requerido' }, 400);
    }

    const typeQuery = c.req.query('type') as ReasonType | undefined;
    if (typeQuery && !VALID_TYPES.includes(typeQuery)) {
      return c.json({ success: false, message: 'Tipo de motivo inválido' }, 400);
    }

    const data = await reasonService.listReasons(branchId, typeQuery);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener los motivos' }, 500);
  }
};

export const getReasonByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await reasonService.getReasonById(id);
    if (!result) return c.json({ success: false, message: 'Motivo no encontrado' }, 404);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Motivo no encontrado' }, 404);
  }
};

export const createReasonController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await reasonService.createReason(data);
    return c.json({ success: true, message: 'Motivo creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el motivo' }, 400);
  }
};

export const updateReasonController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await reasonService.updateReason(id, data);
    if (!result) return c.json({ success: false, message: 'Motivo no encontrado' }, 404);
    return c.json({ success: true, message: 'Motivo actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el motivo' }, 400);
  }
};

export const deleteReasonController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await reasonService.deleteReason(id);
    if (!result) return c.json({ success: false, message: 'Motivo no encontrado' }, 404);
    return c.json({ success: true, message: 'Motivo eliminado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el motivo' }, 400);
  }
};

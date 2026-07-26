import type { Context } from 'hono';
import {
  createSalesChannel,
  deleteSalesChannel,
  getAllSalesChannels,
  getSalesChannelById,
  updateSalesChannel
} from '../../../services/admin/config-local/sales-channel.service';

export const getAllSalesChannelsController = async (c: Context) => {
  try {
    const branchIdParam = c.req.query('branchId');
    let branchId: number | undefined;
    if (branchIdParam !== undefined) {
      branchId = parseInt(branchIdParam);
      if (isNaN(branchId)) {
        return c.json({ success: false, message: 'branchId inválido' }, 400);
      }
    }

    const results = await getAllSalesChannels(branchId);
    return c.json({ success: true, data: results });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener los canales de venta'
    }, 500);
  }
};

export const getSalesChannelByIdController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID inválido' }, 400);
    }

    const result = await getSalesChannelById(id);
    if (!result) {
      return c.json({ success: false, message: 'Canal de venta no encontrado' }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener el canal de venta'
    }, 500);
  }
};

export const createSalesChannelController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await createSalesChannel(data);
    return c.json({
      success: true,
      message: 'Canal de venta creado con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear el canal de venta'
    }, 400);
  }
};

export const updateSalesChannelController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID inválido' }, 400);
    }

    const data = c.req.valid('json' as never);
    const result = await updateSalesChannel(id, data);
    
    if (!result) {
      return c.json({ success: false, message: 'Canal de venta no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: 'Canal de venta actualizado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el canal de venta'
    }, 400);
  }
};

export const deleteSalesChannelController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID inválido' }, 400);
    }

    const result = await deleteSalesChannel(id);
    if (!result) {
      return c.json({ success: false, message: 'Canal de venta no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: 'Canal de venta eliminado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar el canal de venta'
    }, 400);
  }
};

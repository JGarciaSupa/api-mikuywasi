import type { Context } from 'hono';
import { 
  createPaymentMethod, 
  deletePaymentMethod, 
  getAllPaymentMethods, 
  getPaymentMethodById, 
  updatePaymentMethod 
} from '../../services/admin/payment-method.service';

export const getAllPaymentMethodsController = async (c: Context) => {
  try {
    const tenantIdParam = c.req.query('tenantId');
    if (!tenantIdParam) {
      return c.json({ success: false, message: 'ID de tenant requerido' }, 400);
    }
    const tenantId = parseInt(tenantIdParam);
    if (isNaN(tenantId)) {
      return c.json({ success: false, message: 'ID de tenant inválido' }, 400);
    }

    const results = await getAllPaymentMethods(tenantId);
    return c.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener los métodos de pago'
    }, 500);
  }
};

export const getPaymentMethodByIdController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID inválido' }, 400);
    }

    const result = await getPaymentMethodById(id);
    if (!result) {
      return c.json({ success: false, message: 'Método de pago no encontrado' }, 404);
    }

    return c.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener el método de pago'
    }, 500);
  }
};

export const createPaymentMethodController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await createPaymentMethod(data);
    return c.json({
      success: true,
      message: 'Método de pago creado con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear el método de pago'
    }, 400);
  }
};

export const updatePaymentMethodController = async (c: Context) => {
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
    const result = await updatePaymentMethod(id, data);
    
    if (!result) {
      return c.json({ success: false, message: 'Método de pago no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: 'Método de pago actualizado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el método de pago'
    }, 400);
  }
};

export const deletePaymentMethodController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID inválido' }, 400);
    }

    const result = await deletePaymentMethod(id);
    if (!result) {
      return c.json({ success: false, message: 'Método de pago no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: 'Método de pago eliminado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar el método de pago'
    }, 400);
  }
};

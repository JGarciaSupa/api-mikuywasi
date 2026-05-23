import type { Context } from 'hono';
import * as orderService from '../../services/admin/order.service';

/**
 * Listado paginado de órdenes
 */
export const getOrdersController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const status = c.req.query('status');
    const paymentStatus = c.req.query('paymentStatus');
    const search = c.req.query('search');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const result = await orderService.getOrders({
      page,
      limit,
      status,
      paymentStatus,
      search,
      startDate,
      endDate,
    });

    return c.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Error in getOrdersController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al obtener las órdenes',
    }, 500);
  }
};

/**
 * Detalle de una orden
 */
export const getOrderByIdController = async (c: Context) => {
  try {
    const id = c.req.param('id');

    if (!id) {
      return c.json({ success: false, message: 'ID de orden no proporcionado' }, 400);
    }

    const result = await orderService.getOrderById(id);

    if (!result) {
      return c.json({ success: false, message: 'Orden no encontrada' }, 404);
    }

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener el detalle',
    }, 500);
  }
};

/**
 * Actualizar estado de envío
 */
export const updateOrderStatusController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    if (!id) {
      return c.json({ success: false, message: 'ID de orden no proporcionado' }, 400);
    }

    if (!status) {
      return c.json({ success: false, message: 'El estado es requerido' }, 400);
    }

    const result = await orderService.updateOrderStatus(id, status);

    return c.json({
      success: true,
      message: 'Estado actualizado correctamente',
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el estado',
    }, 500);
  }
};

/**
 * Actualizar estado de pago
 */
export const updateOrderPaymentStatusController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    const { paymentStatus } = await c.req.json();

    if (!id) {
      return c.json({ success: false, message: 'ID de orden no proporcionado' }, 400);
    }

    if (!paymentStatus) {
      return c.json({ success: false, message: 'El estado de pago es requerido' }, 400);
    }

    const result = await orderService.updateOrderPaymentStatus(id, paymentStatus);

    return c.json({
      success: true,
      message: 'Estado de pago actualizado correctamente',
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el estado de pago',
    }, 500);
  }
};

/**
 * Estadísticas de órdenes para el dashboard
 */
export const getOrderStatsController = async (c: Context) => {
  try {
    const result = await orderService.getOrderStats();

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener estadísticas',
    }, 500);
  }
};

import type { Context } from 'hono';
import * as kitchenService from '../../../services/admin/config-local/kitchen.service';

export const getKitchenOrdersController = async (c: Context) => {
  try {
    const branchIdQuery = c.req.query('branchId');
    const branchId = branchIdQuery ? parseInt(branchIdQuery, 10) : NaN;
    if (!branchIdQuery || isNaN(branchId)) {
      return c.json({ success: false, message: 'El parámetro branchId es requerido' }, 400);
    }

    const orders = await kitchenService.getActiveKitchenOrders(branchId);

    return c.json({
      success: true,
      data: orders
    });
  } catch (error: any) {
    console.error('Error in getKitchenOrdersController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al obtener las órdenes de cocina'
    }, 500);
  }
};

export const confirmKitchenStationController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    const stationId = parseInt(c.req.param('stationId') || '0');

    if (!id || !stationId) {
      return c.json({ success: false, message: 'ID de pedido o estación inválido' }, 400);
    }

    const { userId } = c.get('jwtPayload') ?? {};
    const result = await kitchenService.confirmStationForOrder(id, stationId, userId);

    return c.json({
      success: true,
      message: result.allConfirmed ? 'Pedido marcado como listo' : 'Estación confirmada, esperando otras estaciones',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in confirmKitchenStationController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al confirmar la estación'
    }, 500);
  }
};

export const setItemPreparedController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    const itemId = parseInt(c.req.param('itemId') || '', 10);
    if (!id || isNaN(itemId)) {
      return c.json({ success: false, message: 'ID de pedido o ítem inválido' }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const qty = body?.qty === undefined ? undefined : Number(body.qty);
    if (qty !== undefined && !Number.isFinite(qty)) {
      return c.json({ success: false, message: 'Cantidad preparada inválida' }, 400);
    }

    const { userId } = c.get('jwtPayload') ?? {};
    const result = await kitchenService.setItemPrepared(id, itemId, qty, userId);

    return c.json({
      success: true,
      message: 'Avance del ítem actualizado',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in setItemPreparedController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el ítem'
    }, 400);
  }
};

export const markOrderPreparedController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ success: false, message: 'ID de pedido no proporcionado' }, 400);
    }

    const { userId } = c.get('jwtPayload') ?? {};
    const result = await kitchenService.markOrderPrepared(id, userId);

    return c.json({
      success: true,
      message: result.allConfirmed ? 'Pedido marcado como listo' : 'Ítems marcados, esperando otras estaciones',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in markOrderPreparedController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al marcar el pedido como listo'
    }, 400);
  }
};

export const recallKitchenOrderController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ success: false, message: 'ID de pedido no proporcionado' }, 400);
    }

    const updated = await kitchenService.recallOrder(id);

    return c.json({
      success: true,
      message: 'Pedido devuelto a la cola',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error in recallKitchenOrderController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al devolver el pedido a la cola'
    }, 400);
  }
};

export const updateKitchenStatusController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    if (!id) {
      return c.json({ success: false, message: 'ID de orden no proporcionado' }, 400);
    }

    if (!['preparing', 'ready_for_pickup', 'completed'].includes(status)) {
      return c.json({ success: false, message: 'Estado no válido para cocina' }, 400);
    }

    const result = await kitchenService.updateKitchenOrderStatus(id, status as any);

    return c.json({
      success: true,
      message: 'Estado de cocina actualizado',
      data: result
    });
  } catch (error: any) {
    console.error('Error in updateKitchenStatusController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el estado'
    }, 500);
  }
};

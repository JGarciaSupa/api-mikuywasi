import type { Context } from 'hono';
import * as kitchenService from '../../../services/admin/config-local/kitchen.service';

/** El usuario que ejecuta la acción, para dejar trazado quién marcó cada plato. */
const actorId = (c: Context) => c.get('jwtPayload')?.userId;

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

/**
 * Marca (o deshace) el avance de UNA línea del pedido.
 * body: { qty?: number } — sin `qty` marca la línea completa; `qty: 0` la deshace.
 */
export const setKitchenItemPreparedController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    const itemId = parseInt(c.req.param('itemId') || '0', 10);

    if (!id || !itemId) {
      return c.json({ success: false, message: 'ID de pedido o de ítem inválido' }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const qty = body?.qty;

    if (qty !== undefined && (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0)) {
      return c.json({ success: false, message: 'La cantidad preparada debe ser un número >= 0' }, 400);
    }

    // Sin `qty` explícito: marcar la línea completa (Number.MAX_SAFE_INTEGER se recorta
    // al `quantity` real dentro del service).
    const result = await kitchenService.setItemPreparedQty(
      id,
      itemId,
      qty ?? Number.MAX_SAFE_INTEGER,
      actorId(c),
    );

    return c.json({
      success: true,
      message: result.allConfirmed ? 'Pedido completo' : 'Avance de cocina actualizado',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in setKitchenItemPreparedController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el ítem'
    }, 500);
  }
};

/** Marca listas todas las líneas del pedido (pedido de una sola estación). */
export const markKitchenOrderPreparedController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ success: false, message: 'ID de pedido no proporcionado' }, 400);

    const result = await kitchenService.markOrderPrepared(id, actorId(c));

    return c.json({ success: true, message: 'Pedido marcado como listo', data: result });
  } catch (error: any) {
    console.error('Error in markKitchenOrderPreparedController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al marcar el pedido como listo'
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

    const result = await kitchenService.confirmStationForOrder(id, stationId, actorId(c));

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

/** Devuelve a la cola un pedido marcado listo por error (recall). */
export const recallKitchenOrderController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ success: false, message: 'ID de pedido no proporcionado' }, 400);

    const result = await kitchenService.recallOrder(id);

    return c.json({ success: true, message: 'Pedido devuelto a la cola de cocina', data: result });
  } catch (error: any) {
    console.error('Error in recallKitchenOrderController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al devolver el pedido a la cola'
    }, 500);
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

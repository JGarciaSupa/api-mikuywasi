import type { Context } from 'hono';
import * as tenantService from '../../../services/client/tenant.service';
import * as waiterOrderService from '../../../services/admin/config-local/waiter-order.service';

/**
 * GET /api/admin/waiter/menu
 * Menú del tenant activo (contexto vía X-Tenant-ID / tenantId query).
 */
export const getWaiterMenuController = async (c: Context) => {
  try {
    const categoriesWithProducts = await tenantService.getMenu();

    return c.json({
      success: true,
      data: categoriesWithProducts,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: error.message || 'Error al obtener el menú',
      },
      500,
    );
  }
};

/**
 * POST /api/admin/waiter/orders
 * Crear pedido en el tenant activo (contexto vía X-Tenant-ID / tenantId query).
 */
export const createWaiterOrderController = async (c: Context) => {
  try {
    const body = await c.req.json();
    await tenantService.validateOrderStockBeforeCreate(body);
    const result = await tenantService.createOrder(body);

    const stockWarnings = await tenantService.triggerStockDischargeForOrder((result as any).id);

    return c.json(
      {
        success: true,
        message: 'Pedido creado exitosamente',
        data: { ...result, stockWarnings: stockWarnings.length ? stockWarnings : undefined },
      },
      201,
    );
  } catch (error: any) {
    const msg = error?.message || 'Error al procesar el pedido';
    const status = msg.includes('Stock insuficiente') || msg.includes('no tiene receta activa') ? 422 : 500;
    return c.json(
      {
        success: false,
        message: msg,
      },
      status as any,
    );
  }
};

/**
 * GET /api/admin/waiter/tables/status
 * Mesas con estado operativo (libre/ocupada) según pedidos activos.
 */
export const getWaiterTablesStatusController = async (c: Context) => {
  try {
    const data = await tenantService.getWaiterTablesStatus();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: error.message || 'Error al obtener estado de mesas',
      },
      500,
    );
  }
};

/**
 * PATCH /api/admin/waiter/orders/:id/items
 * Agregar / eliminar / modificar cantidad de un item de un pedido abierto.
 */
export const editOrderItemController = async (c: Context) => {
  try {

    const orderId = c.req.param('id');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const body = await c.req.json();
    const result = await waiterOrderService.editOrderItem(orderId, body);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404
      : error.message?.includes('No se puede') ? 422
        : 500;
    return c.json({ success: false, message: error.message || 'Error al editar el pedido' }, status as any);
  }
};

/**
 * POST /api/admin/waiter/orders/:id/cancel
 * Cancela el pedido y repone el stock.
 */
export const cancelOrderController = async (c: Context) => {
  try {
    const orderId = c.req.param('id');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const result = await waiterOrderService.cancelOrder(orderId);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404
      : error.message?.includes('No se puede') ? 422
        : 500;
    return c.json({ success: false, message: error.message || 'Error al cancelar el pedido' }, status as any);
  }
};

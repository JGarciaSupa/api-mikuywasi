import type { Context } from 'hono';
import * as tenantService from '../../../services/client/tenant.service';
import * as waiterOrderService from '../../../services/admin/config-local/waiter-order.service';
import * as orderService from '../../../services/admin/documents/order.service';
import * as cashService from '../../../services/admin/documents/cash.service';
import { getAuditActor } from '@/utils/helpers';

/**
 * GET /api/admin/waiter/menu
 * Menú del tenant activo (contexto vía X-Tenant-ID / tenantId query).
 */
export const getWaiterMenuController = async (c: Context) => {
  try {
    const branchIdQuery = c.req.query('branchId');
    const branchId = branchIdQuery ? parseInt(branchIdQuery, 10) : undefined;
    const categoriesWithProducts = await tenantService.getMenu(branchId);

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
    // Regla: el usuario no puede registrar pedidos si no tiene una caja aperturada asociada a él.
    const { userId } = c.get('jwtPayload') ?? {};
    const activeSession = await cashService.getActiveSessionForUser(userId);
    if (!activeSession) {
      return c.json(
        {
          success: false,
          message: 'No puedes registrar pedidos: no tienes un turno de caja abierto. Abre tu turno para continuar.',
        },
        409,
      );
    }

    const body = await c.req.json();
    await tenantService.validateOrderStockBeforeCreate(body);
    // Vincular el pedido al turno abierto del usuario (de ahí salen caja + cajero para el ingreso)
    const result = await tenantService.createOrder({ ...body, cashSessionId: activeSession.id }, 'preparing');

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
    const branchIdQuery = c.req.query('branchId');
    const branchId = branchIdQuery ? parseInt(branchIdQuery, 10) : undefined;
    const data = await tenantService.getWaiterTablesStatus(branchId);
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
    const result = await waiterOrderService.cancelOrder(orderId, getAuditActor(c));
    return c.json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404
      : error.message?.includes('No se puede') ? 422
        : 500;
    return c.json({ success: false, message: error.message || 'Error al cancelar el pedido' }, status as any);
  }
};

/**
 * GET /api/admin/waiter/orders/:id
 * Detalle completo de un pedido (con items) para la vista de mesa ocupada.
 */
export const getWaiterOrderController = async (c: Context) => {
  try {
    const orderId = c.req.param('id');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const order = await orderService.getOrderById(orderId);
    if (!order) {
      return c.json({ success: false, message: 'Pedido no encontrado' }, 404);
    }
    return c.json({ success: true, data: order });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener el pedido' }, 500);
  }
};

/**
 * PATCH /api/admin/waiter/orders/:id/status
 * Actualizar estado del pedido desde la vista de mesero.
 */
export const updateWaiterOrderStatusController = async (c: Context) => {
  try {
    const orderId = c.req.param('id');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const { status } = await c.req.json();
    if (!status) {
      return c.json({ success: false, message: 'El campo status es requerido' }, 400);
    }
    const updated = await orderService.updateOrderStatus(orderId, status);
    if (!updated) {
      return c.json({ success: false, message: 'Pedido no encontrado' }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar estado' }, 500);
  }
};

/**
 * PATCH /api/admin/waiter/orders/:id/payment-status
 * Actualizar estado de pago desde la vista de mesero.
 */
export const updateWaiterOrderPaymentStatusController = async (c: Context) => {
  try {
    const orderId = c.req.param('id');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const { paymentStatus, paymentMethod, paymentMethodId, retentionPercentage } = await c.req.json();
    if (!paymentStatus) {
      return c.json({ success: false, message: 'El campo paymentStatus es requerido' }, 400);
    }
    const updated = await orderService.updateOrderPaymentStatus(
      orderId,
      paymentStatus,
      paymentMethod,
      retentionPercentage,
      paymentMethodId ?? null,
      getAuditActor(c),
    );
    if (!updated) {
      return c.json({ success: false, message: 'Pedido no encontrado' }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar estado de pago' }, 500);
  }
};

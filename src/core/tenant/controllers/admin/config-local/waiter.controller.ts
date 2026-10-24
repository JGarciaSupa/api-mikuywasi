import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
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
        message: safeMessage(error, 'Error al obtener el menú'),
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
    const { userId } = c.get('jwtPayload') ?? {};
    const body = await c.req.json();

    // 1. Si el usuario actual tiene su propio turno abierto (ej. cajero creando pedido), usarlo.
    let activeSession = await cashService.getActiveSessionForUser(userId);

    // 2. Si no tiene turno propio (ej. es un mozo), verificar si envió cashSessionId de una caja abierta de la sede.
    if (!activeSession && body.cashSessionId) {
      const session = await cashService.getCashSessionById(body.cashSessionId);
      if (session && session.status === 'open') {
        activeSession = session;
      }
    }

    // 3. Si aún no hay sesión, buscar la primera caja con turno abierto de la sucursal.
    if (!activeSession) {
      activeSession = await cashService.getActiveSessionForBranch(body.branchId);
    }

    // 4. Si la sucursal NO tiene ninguna caja abierta, bloquear indicando que caja debe aperturar.
    if (!activeSession) {
      return c.json(
        {
          success: false,
          message: 'No se puede registrar pedidos: no hay ninguna caja con turno abierto en esta sucursal. El cajero o administrador debe aperturar caja para iniciar las comandas.',
        },
        409,
      );
    }

    await tenantService.validateOrderStockBeforeCreate(body);
    // Vincular el pedido al turno activo de la sucursal y asegurar atribución del mozo si no venía en el body
    const orderPayload = {
      ...body,
      waiterId: body.waiterId ?? userId ?? null,
      cashSessionId: activeSession.id,
    };
    const result = await tenantService.createOrder(orderPayload, 'preparing');

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
        message: safeMessage(error, 'Error al obtener estado de mesas'),
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
    return c.json({ success: false, message: safeMessage(error, 'Error al editar el pedido') }, status as any);
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
    const body = await c.req.json().catch(() => ({}));
    const result = await waiterOrderService.cancelOrder(orderId, getAuditActor(c), {
      reasonId: body?.reasonId ? Number(body.reasonId) : undefined,
      motivo: body?.motivo,
      password: body?.password,
    });
    return c.json({ success: true, data: result });
  } catch (error: any) {
    const msg = error.message || 'Error al cancelar el pedido';
    const status = /no encontrado/i.test(msg) ? 404
      : /Contraseña de autorización inválida|usuario autorizado/i.test(msg) ? 403
      : /motivo|No se puede/i.test(msg) ? 422
      : 500;
    return c.json({ success: false, message: msg }, status as any);
  }
};

/**
 * POST /api/admin/waiter/orders/:id/items/:itemId/annul
 * Anula (soft-delete) un ítem ya enviado, con motivo y/o contraseña según activaciones.
 */
export const annulOrderItemController = async (c: Context) => {
  try {
    const orderId = c.req.param('id');
    const itemId = Number(c.req.param('itemId'));
    if (!orderId || !itemId || isNaN(itemId)) {
      return c.json({ success: false, message: 'Pedido e ítem requeridos' }, 400);
    }
    const body = await c.req.json().catch(() => ({}));
    const result = await waiterOrderService.annulOrderItem(orderId, itemId, getAuditActor(c), {
      reasonId: body?.reasonId ? Number(body.reasonId) : undefined,
      motivo: body?.motivo,
      password: body?.password,
    }, body?.quantity != null ? Number(body.quantity) : undefined);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    const msg = error.message || 'Error al anular el ítem';
    const status = /no encontrado/i.test(msg) ? 404
      : /Contraseña de autorización inválida|usuario autorizado/i.test(msg) ? 403
      : /motivo|ya está|bloqueado|No se puede/i.test(msg) ? 422
      : 500;
    return c.json({ success: false, message: msg }, status as any);
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
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener el pedido') }, 500);
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
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar estado') }, 500);
  }
};

/**
 * PATCH /api/admin/waiter/orders/:id/waiter
 * Asignar/cambiar el mozo de un pedido abierto desde la vista de mesero.
 */
export const updateWaiterOrderWaiterController = async (c: Context) => {
  try {
    const orderId = c.req.param('id');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const { waiterId } = await c.req.json();
    const updated = await orderService.updateOrderWaiter(orderId, waiterId ?? null);
    if (!updated) {
      return c.json({ success: false, message: 'Pedido no encontrado' }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar el mozo del pedido') }, 500);
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
    const { paymentStatus, paymentMethod, paymentMethodId, retentionPercentage, tipAmount, payments } = await c.req.json();
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
      tipAmount !== undefined ? Number(tipAmount) : undefined,
      payments,
    );
    if (!updated) {
      return c.json({ success: false, message: 'Pedido no encontrado' }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar estado de pago') }, 500);
  }
};

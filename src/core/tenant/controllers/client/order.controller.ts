import type { Context } from 'hono';
import * as tenantService from '../../services/client/tenant.service';
import { getAuditActor } from '@/utils/helpers';

/**
 * POST /api/client/orders
 * Crear un nuevo pedido en la base de datos
 */
export const createOrderController = async (c: Context) => {
  try {
    const body = await c.req.json();
    
    // Validate stock before creating
    await tenantService.validateOrderStockBeforeCreate(body);
    
    // Call service to create the order
    const actor = getAuditActor(c);
    const result = await tenantService.createOrder(body, undefined, actor);

    // Trigger stock discharge immediately
    const stockWarnings = await tenantService.triggerStockDischargeForOrder((result as any).id);

    return c.json({
      success: true,
      message: 'Pedido creado exitosamente',
      data: { ...result, stockWarnings: stockWarnings.length ? stockWarnings : undefined }
    }, 201);
  } catch (error: any) {
    console.error('Error in createOrderController:', error);
    const msg = error?.message || 'Error al procesar el pedido';
    const status = msg.includes('Stock insuficiente') ? 422 : 500;
    return c.json({
      success: false,
      message: msg
    }, status as any);
  }
};

/**
 * GET /api/client/orders/tracking/:trackingCode
 * Obtener el detalle público de un pedido mediante su código de seguimiento
 */
export const getOrderByTrackingCodeController = async (c: Context) => {
  try {
    const trackingCode = c.req.param('trackingCode');

    if (!trackingCode) {
      return c.json({ success: false, message: 'Tracking code no proporcionado' }, 400);
    }

    const result = await tenantService.getOrderByTrackingCode(trackingCode);
    
    if (!result) {
      return c.json({ success: false, message: 'Orden no encontrada' }, 404);
    }

    return c.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Error in getOrderByTrackingCodeController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al obtener el detalle del pedido'
    }, 500);
  }
};

import type { Context } from 'hono';
import * as tenantService from '../../services/client/tenant.service';

/**
 * POST /api/client/orders
 * Crear un nuevo pedido en la base de datos
 */
export const createOrderController = async (c: Context) => {
  try {
    const body = await c.req.json();
    
    // Call service to create the order
    const result = await tenantService.createOrder(body);

    return c.json({
      success: true,
      message: 'Pedido creado exitosamente',
      data: result
    }, 201);
  } catch (error: any) {
    console.error('Error in createOrderController:', error);
    return c.json({
      success: false,
      message: error.message || 'Error al procesar el pedido'
    }, 500);
  }
};

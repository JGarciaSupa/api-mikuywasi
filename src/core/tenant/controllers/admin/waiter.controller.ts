import type { Context } from 'hono';
import * as tenantService from '../../services/client/tenant.service';

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
    const result = await tenantService.createOrder(body);

    return c.json(
      {
        success: true,
        message: 'Pedido creado exitosamente',
        data: result,
      },
      201,
    );
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: error.message || 'Error al procesar el pedido',
      },
      500,
    );
  }
};

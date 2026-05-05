import type { Context } from 'hono';
import * as tenantService from '../../services/client/tenant.service';

/**
 * GET /api/admin/waiter/menu
 * Obtener menú del tenant autenticado usando tenantId del token.
 */
export const getWaiterMenuController = async (c: Context) => {
  try {
    const payload = c.get('jwtPayload');
    const tenantId = payload?.tenantId;

    if (!tenantId) {
      return c.json({ success: false, message: 'Tenant no asociado al token' }, 400);
    }

    const categoriesWithProducts = await tenantService.getMenuByTenantId(tenantId);

    if (!categoriesWithProducts) {
      return c.json({ success: false, message: 'Tenant no encontrado' }, 404);
    }

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
 * Crear pedido para el tenant autenticado usando tenantId del token.
 */
export const createWaiterOrderController = async (c: Context) => {
  try {
    const payload = c.get('jwtPayload');
    const tenantId = payload?.tenantId;

    if (!tenantId) {
      return c.json({ success: false, message: 'Tenant no asociado al token' }, 400);
    }

    const body = await c.req.json();
    const result = await tenantService.createOrder({ ...body, tenantId });

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

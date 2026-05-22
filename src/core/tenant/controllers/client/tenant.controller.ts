import type { Context } from 'hono';
import * as tenantService from '../../services/client/tenant.service';

export const getTenantInfoController = async (c: Context) => {
  try {
    const data = await tenantService.getTenantInfo();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener la información del tenant' }, 500);
  }
};

export const getMenuController = async (c: Context) => {
  try {
    const data = await tenantService.getMenu();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener el menú' }, 500);
  }
};

export const getTablesController = async (c: Context) => {
  try {
    const data = await tenantService.getTables();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener las mesas' }, 500);
  }
};

export const getPaymentMethodsController = async (c: Context) => {
  try {
    const data = await tenantService.getPaymentMethods();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener los métodos de pago' }, 500);
  }
};

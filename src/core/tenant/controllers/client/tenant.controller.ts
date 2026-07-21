import type { Context } from 'hono';
import * as tenantService from '../../services/client/tenant.service';

function parseBranchId(c: Context): number | undefined {
  const raw = c.req.query('branchId');
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const getTenantInfoController = async (c: Context) => {
  try {
    const data = await tenantService.getTenantInfo(parseBranchId(c));
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener la información del tenant' }, 500);
  }
};

export const getBranchesController = async (c: Context) => {
  try {
    const data = await tenantService.getBranches();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener las sucursales' }, 500);
  }
};

export const getMenuController = async (c: Context) => {
  try {
    const data = await tenantService.getMenu(parseBranchId(c));
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener el menú' }, 500);
  }
};

export const getTablesController = async (c: Context) => {
  try {
    const data = await tenantService.getTables(parseBranchId(c));
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener las mesas' }, 500);
  }
};

export const getPaymentMethodsController = async (c: Context) => {
  try {
    const data = await tenantService.getPaymentMethods(parseBranchId(c));
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener los métodos de pago' }, 500);
  }
};

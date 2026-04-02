import type { Context } from 'hono';
import * as settingsService from '../../services/admin/settings.service';

export const getSettingsController = async (c: Context) => {
  try {
    const { tenantId } = c.get('jwtPayload');
    if (!tenantId) throw new Error('Tenant ID no encontrado en el token');

    const result = await settingsService.getSettings(tenantId);
    return c.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener la configuración'
    }, 500);
  }
};

export const updateSettingsController = async (c: Context) => {
  try {
    const { tenantId } = c.get('jwtPayload');
    if (!tenantId) throw new Error('Tenant ID no encontrado en el token');

    const data = c.req.valid('json' as never);
    const result = await settingsService.updateSettings(tenantId, data);

    return c.json({
      success: true,
      message: 'Configuración actualizada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar la configuración'
    }, 400);
  }
};

export const updateLogoController = async (c: Context) => {
  try {
    const { tenantId } = c.get('jwtPayload');
    if (!tenantId) throw new Error('Tenant ID no encontrado en el token');

    const body = await c.req.parseBody();
    const logoFile = body['logo'] as File;

    if (!logoFile) {
      return c.json({
        success: false,
        message: 'No se proporcionó ningún archivo de logo'
      }, 400);
    }

    const result = await settingsService.updateLogo(tenantId, logoFile);

    return c.json({
      success: true,
      message: 'Logo actualizado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el logo'
    }, 400);
  }
};

import type { Context } from 'hono';
import * as settingsService from '../../../services/admin/config-local/settings.service';

export const getSettingsController = async (c: Context) => {
  try {
    const result = await settingsService.getSettings();
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener la configuración' }, 500);
  }
};

export const updatePublicInfoController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await settingsService.updateSettings(data);
    return c.json({ success: true, message: 'Información pública actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la información' }, 400);
  }
};

export const updateOperationController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await settingsService.updateSettings(data);
    return c.json({ success: true, message: 'Configuración de operación actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la configuración' }, 400);
  }
};

export const updateLocationController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never) as any;
    const { deliveryZone, ...addressFields } = data;
    const result = await settingsService.updateSettings({
      address: addressFields,
      ...(deliveryZone !== undefined ? { deliveryZone } : {}),
    } as any);
    return c.json({ success: true, message: 'Ubicación actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la ubicación' }, 400);
  }
};

export const updateAdminController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await settingsService.updateSettings(data);
    return c.json({ success: true, message: 'Información administrativa actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la información administrativa' }, 400);
  }
};

export const updateLogoController = async (c: Context) => {
  try {
    const body = await c.req.parseBody();
    const logoFile = body['logo'] as File;

    if (!logoFile) {
      return c.json({ success: false, message: 'No se proporcionó ningún archivo de logo' }, 400);
    }

    const result = await settingsService.updateLogo(logoFile);
    return c.json({ success: true, message: 'Logo actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el logo' }, 400);
  }
};

export const deleteLogoController = async (c: Context) => {
  try {
    const result = await settingsService.deleteLogo();
    return c.json({ success: true, message: 'Logo eliminado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el logo' }, 400);
  }
};

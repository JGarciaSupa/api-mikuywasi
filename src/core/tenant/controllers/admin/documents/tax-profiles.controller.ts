import type { Context } from 'hono';
import * as taxProfilesService from '../../../services/admin/documents/tax-profiles.service';
import { jsonError } from '@/utils/helpers';

// Sin validación de permisos por ahora (a definir más adelante).

export const searchTaxProfilesController = async (c: Context) => {
  try {
    const search = c.req.query('search');
    const data = await taxProfilesService.searchTaxProfiles(search);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al buscar perfiles fiscales');
  }
};

// Busca por documento; reutiliza si existe, crea si no.
export const resolveTaxProfileController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await taxProfilesService.resolveOrCreateTaxProfile(body);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al resolver perfil fiscal');
  }
};

export const deleteTaxProfileController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    await taxProfilesService.deleteTaxProfile(id);
    return c.json({ success: true });
  } catch (e) {
    return jsonError(c, e, 'Error al eliminar perfil fiscal');
  }
};

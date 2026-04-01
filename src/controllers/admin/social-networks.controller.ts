import type { Context } from 'hono';
import { 
  createSocialNetwork, 
  deleteSocialNetwork, 
  getAllSocialNetworks, 
  getSocialNetworkById, 
  reorderSocialNetworks, 
  updateSocialNetwork 
} from '../../services/admin/social-networks.service';

export const getAllSocialNetworksController = async (c: Context) => {
  try {
    const tenantIdParam = c.req.query('tenantId');
    if (!tenantIdParam) {
      return c.json({ success: false, message: 'ID de tenant requerido' }, 400);
    }
    const tenantId = parseInt(tenantIdParam);
    if (isNaN(tenantId)) {
      return c.json({ success: false, message: 'ID de tenant inválido' }, 400);
    }

    const results = await getAllSocialNetworks(tenantId);
    return c.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener las redes sociales'
    }, 500);
  }
};

export const getSocialNetworkByIdController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de red social requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de red social inválido' }, 400);
    }

    const result = await getSocialNetworkById(id);
    if (!result) {
      return c.json({ success: false, message: 'Red social no encontrada' }, 404);
    }

    return c.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener la red social'
    }, 500);
  }
};

export const createSocialNetworkController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await createSocialNetwork(data);
    return c.json({
      success: true,
      message: 'Red social creada con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear la red social'
    }, 400);
  }
};

export const updateSocialNetworkController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de red social requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de red social inválido' }, 400);
    }

    const data = c.req.valid('json' as never);
    const result = await updateSocialNetwork(id, data);
    
    if (!result) {
      return c.json({ success: false, message: 'Red social no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Red social actualizada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar la red social'
    }, 400);
  }
};

export const deleteSocialNetworkController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de red social requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de red social inválido' }, 400);
    }

    const result = await deleteSocialNetwork(id);
    if (!result) {
      return c.json({ success: false, message: 'Red social no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Red social eliminada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar la red social'
    }, 400);
  }
};

export const reorderSocialNetworksController = async (c: Context) => {
  try {
    const { socialNetworks } = c.req.valid('json' as never);
    const results = await reorderSocialNetworks(socialNetworks);

    return c.json({
      success: true,
      message: 'Redes sociales reordenadas con éxito',
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al reordenar las redes sociales'
    }, 400);
  }
};

import type { Context } from 'hono';
import {
  createBanner,
  deleteBanner,
  getAllBanners,
  getBannerById,
  reorderBanners,
  updateBanner
} from '../../../services/admin/config-local/banners.service';

export const getAllBannersController = async (c: Context) => {
  try {
    const results = await getAllBanners();
    return c.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener los banners'
    }, 500);
  }
};

export const getBannerByIdController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de banner requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de banner inválido' }, 400);
    }

    const result = await getBannerById(id);
    if (!result) {
      return c.json({ success: false, message: 'Banner no encontrado' }, 404);
    }

    return c.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener el banner'
    }, 500);
  }
};

export const createBannerController = async (c: Context) => {
  try {
    const body = await c.req.parseBody();
    const imageFile = body.image as File;

    if (!imageFile || !(imageFile instanceof File)) {
      return c.json({ success: false, message: 'La imagen es requerida' }, 400);
    }

    const validatedData = c.req.valid('form' as never) as any;

    const result = await createBanner(validatedData, imageFile);

    return c.json({
      success: true,
      message: 'Banner creado con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear el banner'
    }, 400);
  }
};

export const updateBannerController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de banner requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de banner inválido' }, 400);
    }

    const body = await c.req.parseBody();
    const imageFile = body.image as File | undefined;
    const validatedData = c.req.valid('form' as never) as any;

    const result = await updateBanner(id, validatedData, imageFile instanceof File ? imageFile : undefined);

    return c.json({
      success: true,
      message: 'Banner actualizado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el banner'
    }, 400);
  }
};

export const deleteBannerController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de banner requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de banner inválido' }, 400);
    }

    const result = await deleteBanner(id);

    return c.json({
      success: true,
      message: 'Banner eliminado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar el banner'
    }, 400);
  }
};

export const reorderBannersController = async (c: Context) => {
  try {
    const { banners } = c.req.valid('json' as never) as any;
    const results = await reorderBanners(banners);

    return c.json({
      success: true,
      message: 'Banners reordenados con éxito',
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al reordenar los banners'
    }, 400);
  }
};

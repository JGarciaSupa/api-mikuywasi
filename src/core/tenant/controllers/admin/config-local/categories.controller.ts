import type { Context } from 'hono';
import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
  reorderCategories,
  updateCategory
} from '../../../services/admin/config-local/categories.service';

export const getAllCategoriesController = async (c: Context) => {
  try {
    const results = await getAllCategories();
    return c.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener las categorías'
    }, 500);
  }
};

export const getCategoryByIdController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de categoría requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de categoría inválido' }, 400);
    }

    const result = await getCategoryById(id);
    if (!result) {
      return c.json({ success: false, message: 'Categoría no encontrada' }, 404);
    }

    return c.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener la categoría'
    }, 500);
  }
};

export const createCategoryController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await createCategory(data);
    return c.json({
      success: true,
      message: 'Categoría creada con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear la categoría'
    }, 400);
  }
};

export const updateCategoryController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de categoría requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de categoría inválido' }, 400);
    }

    const data = c.req.valid('json' as never);
    const result = await updateCategory(id, data);

    if (!result) {
      return c.json({ success: false, message: 'Categoría no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Categoría actualizada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar la categoría'
    }, 400);
  }
};

export const deleteCategoryController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de categoría requerido' }, 400);
    }
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de categoría inválido' }, 400);
    }

    const result = await deleteCategory(id);
    if (!result) {
      return c.json({ success: false, message: 'Categoría no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Categoría eliminada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar la categoría'
    }, 400);
  }
};

export const reorderCategoriesController = async (c: Context) => {
  try {
    const { categories } = c.req.valid('json' as never);
    const results = await reorderCategories(categories);

    return c.json({
      success: true,
      message: 'Categorías reordenadas con éxito',
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al reordenar las categorías'
    }, 400);
  }
};

import type { Context } from 'hono';
import * as catalog from '../../../services/admin/warehouse/catalog.service';
import { jsonError } from '@/utils/helpers';

export const listCategories = async (c: Context) => {
  try {
    const data = await catalog.listCategories();
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar categorías');
  }
};

export const createCategory = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await catalog.createCategory(body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear categoría');
  }
};

export const listSubcategories = async (c: Context) => {
  try {
    const categoryIdQuery = c.req.query('categoryId');
    const categoryId = categoryIdQuery ? parseInt(categoryIdQuery, 10) : undefined;
    const data = await catalog.listSubcategories(categoryId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar subcategorías');
  }
};

export const createSubcategory = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await catalog.createSubcategory(body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear subcategoría');
  }
};

export const listAreas = async (c: Context) => {
  try {
    const branchIdQuery = c.req.query('branchId');
    const branchId = branchIdQuery ? parseInt(branchIdQuery, 10) : undefined;
    const data = await catalog.listAreas(branchId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar áreas');
  }
};

export const createArea = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await catalog.createArea(body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear área');
  }
};

export const listSuppliers = async (c: Context) => {
  try {
    const data = await catalog.listSuppliers(c.req.query('search'));
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar proveedores');
  }
};

export const createSupplier = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await catalog.createSupplier(body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear proveedor');
  }
};

export const listItems = async (c: Context) => {
  try {
    const data = await catalog.listItems({
      search: c.req.query('search'),
      subcategoryId: c.req.query('subcategoryId') ? parseInt(c.req.query('subcategoryId')!) : undefined,
      categoryId: c.req.query('categoryId') ? parseInt(c.req.query('categoryId')!) : undefined,
      isActive: c.req.query('isActive') === 'true' ? true : c.req.query('isActive') === 'false' ? false : undefined,
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar artículos');
  }
};

export const getItem = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await catalog.getItemById(id);
    if (!data) return c.json({ success: false, message: 'Artículo no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener artículo');
  }
};

export const createItem = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await catalog.createItem(body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear artículo');
  }
};

export const listItemsByArea = async (c: Context) => {
  try {
    const areaId = parseInt(c.req.param('areaId') || '0', 10);
    const data = await catalog.listItemsByArea(areaId, c.req.query('search'));
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar artículos del área');
  }
};

export const assignItemArea = async (c: Context) => {
  try {
    const itemId = parseInt(c.req.param('itemId') || '0', 10);
    const { areaId } = await c.req.json();
    const data = await catalog.assignItemToArea(itemId, areaId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al asignar artículo al área');
  }
};

export const removeItemArea = async (c: Context) => {
  try {
    const itemId = parseInt(c.req.param('itemId') || '0', 10);
    const areaId = parseInt(c.req.param('areaId') || '0', 10);
    await catalog.removeItemFromArea(itemId, areaId);
    return c.json({ success: true, message: 'Asignación eliminada' });
  } catch (e) {
    return jsonError(c, e, 'Error al quitar artículo del área');
  }
};

export const updateCategory = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const body = await c.req.json();
    const data = await catalog.updateCategory(id, body);
    if (!data) return c.json({ success: false, message: 'Categoría no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar categoría');
  }
};

export const updateSubcategory = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const body = await c.req.json();
    const data = await catalog.updateSubcategory(id, body);
    if (!data) return c.json({ success: false, message: 'Subcategoría no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar subcategoría');
  }
};

export const updateArea = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const body = await c.req.json();
    const data = await catalog.updateArea(id, body);
    if (!data) return c.json({ success: false, message: 'Área no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar área');
  }
};

export const getSupplier = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await catalog.getSupplierById(id);
    if (!data) return c.json({ success: false, message: 'Proveedor no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener proveedor');
  }
};

export const updateSupplier = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const body = await c.req.json();
    const data = await catalog.updateSupplier(id, body);
    if (!data) return c.json({ success: false, message: 'Proveedor no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar proveedor');
  }
};

export const updateItem = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const body = await c.req.json();
    const data = await catalog.updateItem(id, body);
    if (!data) return c.json({ success: false, message: 'Artículo no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar artículo');
  }
};

// ─── Unidades de medida ──────────────────────────────────────

export const listMeasurementUnits = async (c: Context) => {
  try {
    const dimension = c.req.query('dimension') as 'weight' | 'volume' | 'unit' | 'length' | undefined;
    const data = await catalog.listMeasurementUnits(dimension);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar unidades de medida');
  }
};

export const createMeasurementUnit = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await catalog.createMeasurementUnit(body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear unidad de medida');
  }
};

export const updateMeasurementUnit = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const body = await c.req.json();
    const data = await catalog.updateMeasurementUnit(id, body);
    if (!data) return c.json({ success: false, message: 'Unidad no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar unidad de medida');
  }
};

export const deleteArea = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    await catalog.deleteArea(id);
    return c.json({ success: true, message: 'Área eliminada' });
  } catch (e: any) {
    const errorMsg = e?.message || '';
    if (errorMsg.includes('foreign key') || errorMsg.includes('violates foreign key constraint')) {
      return c.json({
        success: false,
        message: 'No se puede eliminar esta área porque tiene movimientos de almacén o artículos asociados. Le recomendamos desactivarla.'
      }, 400);
    }
    return jsonError(c, e, 'Error al eliminar área');
  }
};

export const deleteCategory = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    await catalog.deleteCategory(id);
    return c.json({ success: true, message: 'Categoría eliminada' });
  } catch (e: any) {
    const errorMsg = e?.message || '';
    if (errorMsg.includes('foreign key') || errorMsg.includes('violates foreign key constraint')) {
      return c.json({
        success: false,
        message: 'No se puede eliminar esta categoría porque tiene subcategorías o insumos asociados. Le recomendamos desactivarla.'
      }, 400);
    }
    return jsonError(c, e, 'Error al eliminar categoría');
  }
};

export const deleteSubcategory = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    await catalog.deleteSubcategory(id);
    return c.json({ success: true, message: 'Subcategoría eliminada' });
  } catch (e: any) {
    const errorMsg = e?.message || '';
    if (errorMsg.includes('foreign key') || errorMsg.includes('violates foreign key constraint')) {
      return c.json({
        success: false,
        message: 'No se puede eliminar esta subcategoría porque tiene artículos asociados. Le recomendamos desactivarla.'
      }, 400);
    }
    return jsonError(c, e, 'Error al eliminar subcategoría');
  }
};


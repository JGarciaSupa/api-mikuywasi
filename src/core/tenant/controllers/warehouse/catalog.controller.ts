import type { Context } from 'hono';
import * as catalog from '../../services/warehouse/catalog.service';
import { getAuditActor, jsonError } from '../../../../utils/helpers';

export const listFamilies = async (c: Context) => {
  try {
    const data = await catalog.listFamilies();
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar familias');
  }
};

export const createFamily = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await catalog.createFamily(body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear familia');
  }
};

export const listSubfamilies = async (c: Context) => {
  try {
    const familyId = c.req.query('familyId') ? parseInt(c.req.query('familyId')!) : undefined;
    const data = await catalog.listSubfamilies(familyId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar subfamilias');
  }
};

export const createSubfamily = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await catalog.createSubfamily(body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear subfamilia');
  }
};

export const listAreas = async (c: Context) => {
  try {
    const data = await catalog.listAreas();
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
      subfamilyId: c.req.query('subfamilyId') ? parseInt(c.req.query('subfamilyId')!) : undefined,
      isActive: c.req.query('isActive') === 'true' ? true : c.req.query('isActive') === 'false' ? false : undefined,
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar artículos');
  }
};

export const getItem = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
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
    const areaId = parseInt(c.req.param('areaId'));
    const data = await catalog.listItemsByArea(areaId, c.req.query('search'));
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar artículos del área');
  }
};

export const assignItemArea = async (c: Context) => {
  try {
    const itemId = parseInt(c.req.param('itemId'));
    const { areaId } = await c.req.json();
    const data = await catalog.assignItemToArea(itemId, areaId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al asignar artículo al área');
  }
};

export const removeItemArea = async (c: Context) => {
  try {
    const itemId = parseInt(c.req.param('itemId'));
    const areaId = parseInt(c.req.param('areaId'));
    await catalog.removeItemFromArea(itemId, areaId);
    return c.json({ success: true, message: 'Asignación eliminada' });
  } catch (e) {
    return jsonError(c, e, 'Error al quitar artículo del área');
  }
};

export const updateFamily = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = await catalog.updateFamily(id, body);
    if (!data) return c.json({ success: false, message: 'Familia no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar familia');
  }
};

export const updateSubfamily = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = await catalog.updateSubfamily(id, body);
    if (!data) return c.json({ success: false, message: 'Subfamilia no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar subfamilia');
  }
};

export const updateArea = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
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
    const id = parseInt(c.req.param('id'));
    const data = await catalog.getSupplierById(id);
    if (!data) return c.json({ success: false, message: 'Proveedor no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener proveedor');
  }
};

export const updateSupplier = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
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
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = await catalog.updateItem(id, body);
    if (!data) return c.json({ success: false, message: 'Artículo no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar artículo');
  }
};

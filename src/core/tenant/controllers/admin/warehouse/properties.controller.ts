import type { Context } from 'hono';
import * as propertiesService from '../../../services/admin/warehouse/properties.service';

// ─── Grupos ──────────────────────────────────────────────────────────────────

export const listPropertyGroups = async (c: Context) => {
  try {
    const brandId = parseInt(c.req.query('brandId') ?? '');
    if (!brandId) return c.json({ success: false, message: 'brandId es requerido' }, 400);
    const data = await propertiesService.listPropertyGroups(brandId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const getPropertyGroup = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await propertiesService.getPropertyGroupById(id);
    if (!data) return c.json({ success: false, message: 'Grupo no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const createPropertyGroup = async (c: Context) => {
  try {
    const body = await c.req.json();
    if (!body.brandId) return c.json({ success: false, message: 'brandId es requerido' }, 400);
    const data = await propertiesService.createPropertyGroup(body);
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const updatePropertyGroup = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = await propertiesService.updatePropertyGroup(id, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const deletePropertyGroup = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    await propertiesService.deletePropertyGroup(id);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

// ─── Propiedades individuales ────────────────────────────────────────────────

export const createProperty = async (c: Context) => {
  try {
    const groupId = parseInt(c.req.param('groupId'));
    const body = await c.req.json();
    const data = await propertiesService.createProperty({ ...body, groupId });
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const updateProperty = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = await propertiesService.updateProperty(id, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const deleteProperty = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    await propertiesService.deleteProperty(id);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

// ─── Asignación a productos ──────────────────────────────────────────────────

export const getProductPropertyGroups = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id'));
    const data = await propertiesService.getPropertiesForProduct(productId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const assignGroupToProduct = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id'));
    const { groupId } = await c.req.json();
    await propertiesService.assignGroupToProduct(productId, groupId);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const unassignGroupFromProduct = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id'));
    const groupId = parseInt(c.req.param('groupId'));
    await propertiesService.unassignGroupFromProduct(productId, groupId);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

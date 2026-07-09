import type { Context } from 'hono';
import * as extrasService from '../../../services/admin/warehouse/extras.service';

// ─── Grupos ──────────────────────────────────────────────────────────────────

export const listExtraGroups = async (c: Context) => {
  try {
    const brandId = parseInt(c.req.query('brandId') ?? '');
    if (!brandId) return c.json({ success: false, message: 'brandId es requerido' }, 400);
    const data = await extrasService.listExtraGroups(brandId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const getExtraGroup = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await extrasService.getExtraGroupById(id);
    if (!data) return c.json({ success: false, message: 'Grupo no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const createExtraGroup = async (c: Context) => {
  try {
    const body = await c.req.json();
    if (!body.brandId) return c.json({ success: false, message: 'brandId es requerido' }, 400);
    const data = await extrasService.createExtraGroup(body);
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const updateExtraGroup = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = await extrasService.updateExtraGroup(id, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const deleteExtraGroup = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    await extrasService.deleteExtraGroup(id);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

// ─── Extras individuales ─────────────────────────────────────────────────────

export const createExtra = async (c: Context) => {
  try {
    const groupId = parseInt(c.req.param('groupId'));
    const body = await c.req.json();
    const data = await extrasService.createExtra({ ...body, groupId });
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const updateExtra = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = await extrasService.updateExtra(id, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const deleteExtra = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    await extrasService.deleteExtra(id);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

// ─── Asignación a productos ──────────────────────────────────────────────────

export const getProductExtraGroups = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id'));
    const data = await extrasService.getExtrasForProduct(productId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const assignGroupToProduct = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id'));
    const { groupId, extraIds } = await c.req.json();
    await extrasService.assignGroupToProduct(productId, groupId, extraIds ?? null);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const unassignGroupFromProduct = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id'));
    const groupId = parseInt(c.req.param('groupId'));
    await extrasService.unassignGroupFromProduct(productId, groupId);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

// ─── Productos vinculados a un grupo (vista inversa, desde el propio grupo) ──

export const getGroupProducts = async (c: Context) => {
  try {
    const groupId = parseInt(c.req.param('id'));
    const data = await extrasService.getProductsForGroup(groupId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

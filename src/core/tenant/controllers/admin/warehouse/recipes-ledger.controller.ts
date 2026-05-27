import type { Context } from 'hono';
import * as recipes from '../../../services/admin/warehouse/recipes.service';
import * as salesDischarge from '../../../services/admin/warehouse/sales-discharge.service';
import * as ledger from '../../../services/admin/warehouse/ledger.service';
import * as settings from '../../../services/admin/warehouse/settings.service';
import * as batches from '../../../services/admin/warehouse/batches.service';
import { jsonError, getAuditActor } from '@/utils/helpers';

export const listRecipes = async (c: Context) => {
  try {
    const productId = c.req.query('productId') ? parseInt(c.req.query('productId')!) : undefined;
    const data = await recipes.listRecipes(productId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar recetas');
  }
};

export const getRecipe = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await recipes.getRecipeById(id);
    if (!data) return c.json({ success: false, message: 'Receta no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener receta');
  }
};

export const getRecipeByProduct = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('productId'));
    const data = await recipes.getRecipeByProductId(productId);
    if (!data) return c.json({ success: false, message: 'Receta no encontrada para este producto' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener receta del producto');
  }
};

export const createRecipe = async (c: Context) => {
  try {
    const { lines, ...header } = c.req.valid('json' as never);
    const data = await recipes.createRecipe(header, lines);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear receta');
  }
};

export const updateRecipe = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const { lines, ...header } = await c.req.json();
    const data = await recipes.updateRecipe(id, header, lines);
    if (!data) return c.json({ success: false, message: 'Receta no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar receta');
  }
};

export const listSalesDischarges = async (c: Context) => {
  try {
    const page = c.req.query('page') ? parseInt(c.req.query('page')!) : 1;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 20;
    const status = c.req.query('status') || undefined;
    const orderId = c.req.query('orderId') || undefined;
    const result = await salesDischarge.listSalesDischarges({ page, limit, status, orderId });
    return c.json({ success: true, ...result });
  } catch (e) {
    return jsonError(c, e, 'Error al listar descargas');
  }
};

export const getSalesDischarge = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await salesDischarge.getSalesDischargeDetail(id);
    if (!data) return c.json({ success: false, message: 'Descarga no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener descarga');
  }
};

export const previewSalesDischarge = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    const data = await salesDischarge.buildDischargeFromOrder(orderId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al calcular descarga');
  }
};

export const createSalesDischarge = async (c: Context) => {
  try {
    const { orderId, areaId } = c.req.valid('json' as never);
    const data = await salesDischarge.createSalesDischargeFromOrder(orderId, areaId, getAuditActor(c));
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear descarga de venta');
  }
};

export const processSalesDischarge = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await salesDischarge.processSalesDischarge(id, getAuditActor(c));
    return c.json({ success: true, message: 'Descarga procesada', data });
  } catch (e) {
    return jsonError(c, e, 'Error al procesar descarga');
  }
};

export const getKardex = async (c: Context) => {
  try {
    const areaId = parseInt(c.req.param('areaId'));
    const itemId = c.req.query('itemId') ? parseInt(c.req.query('itemId')!) : undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100;
    const data = await ledger.getKardexByArea(areaId, itemId, limit);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener kardex');
  }
};

export const getStockSnapshot = async (c: Context) => {
  try {
    const areaId = c.req.query('areaId') ? parseInt(c.req.query('areaId')!) : undefined;
    const data = await ledger.getStockByArea(areaId);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener stock por área');
  }
};

export const listWaste = async (c: Context) => {
  try {
    const data = await ledger.listWasteLog({
      areaId: c.req.query('areaId') ? parseInt(c.req.query('areaId')!) : undefined,
      from: c.req.query('from'),
      to: c.req.query('to'),
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar mermas');
  }
};

export const listSettings = async (c: Context) => {
  try {
    const data = await settings.listSettings();
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar configuración');
  }
};

export const upsertSetting = async (c: Context) => {
  try {
    const key = c.req.param('key');
    const { value } = c.req.valid('json' as never);
    const data = await settings.upsertSetting(key, value, getAuditActor(c));
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al guardar configuración');
  }
};

export const listBatches = async (c: Context) => {
  try {
    const data = await batches.listBatches({
      areaId: c.req.query('areaId') ? parseInt(c.req.query('areaId')!) : undefined,
      itemId: c.req.query('itemId') ? parseInt(c.req.query('itemId')!) : undefined,
      status: c.req.query('status'),
      expiringOnly: c.req.query('expiringOnly') === 'true',
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar lotes');
  }
};

export const refreshBatches = async (c: Context) => {
  try {
    const data = await batches.refreshBatchStatuses();
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar estados de lotes');
  }
};

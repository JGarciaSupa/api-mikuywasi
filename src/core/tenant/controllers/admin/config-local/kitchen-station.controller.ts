import type { Context } from 'hono';
import * as kitchenStationService from '../../../services/admin/config-local/kitchen-station.service';

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const listKitchenStationsController = async (c: Context) => {
  try {
    const branchIdQuery = c.req.query('branchId');
    const branchId = branchIdQuery ? parseInt(branchIdQuery, 10) : NaN;
    if (!branchIdQuery || isNaN(branchId)) {
      return c.json({ success: false, message: 'El parámetro branchId es requerido' }, 400);
    }
    const data = await kitchenStationService.listKitchenStations(branchId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener las estaciones de cocina' }, 500);
  }
};

export const getKitchenStationByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await kitchenStationService.getKitchenStationById(id);
    if (!result) return c.json({ success: false, message: 'Estación no encontrada' }, 404);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Estación no encontrada' }, 404);
  }
};

export const createKitchenStationController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await kitchenStationService.createKitchenStation(data);
    return c.json({ success: true, message: 'Estación creada con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear la estación' }, 400);
  }
};

export const updateKitchenStationController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await kitchenStationService.updateKitchenStation(id, data);
    if (!result) return c.json({ success: false, message: 'Estación no encontrada' }, 404);
    return c.json({ success: true, message: 'Estación actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la estación' }, 400);
  }
};

export const deleteKitchenStationController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await kitchenStationService.deleteKitchenStation(id);
    if (!result) return c.json({ success: false, message: 'Estación no encontrada' }, 404);
    return c.json({ success: true, message: 'Estación eliminada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar la estación' }, 400);
  }
};

// ─── Asignación a productos ──────────────────────────────────────────────────

export const getProductKitchenStationsController = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id') || '0');
    const branchIdQuery = c.req.query('branchId');
    const branchId = branchIdQuery ? parseInt(branchIdQuery, 10) : NaN;
    if (!branchIdQuery || isNaN(branchId)) {
      return c.json({ success: false, message: 'El parámetro branchId es requerido' }, 400);
    }
    const data = await kitchenStationService.getStationsForProduct(productId, branchId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener las estaciones del producto' }, 500);
  }
};

export const assignStationToProductController = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id') || '0');
    const { stationCode } = await c.req.json();
    if (!stationCode) {
      return c.json({ success: false, message: 'El código de estación es requerido' }, 400);
    }
    const result = await kitchenStationService.assignStationToProduct(productId, String(stationCode));
    return c.json({ success: true, data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al asignar la estación' }, 400);
  }
};

export const unassignStationFromProductController = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id') || '0');
    const stationCode = c.req.param('stationCode') || '';
    if (!stationCode) {
      return c.json({ success: false, message: 'El código de estación es requerido' }, 400);
    }
    await kitchenStationService.unassignStationFromProduct(productId, stationCode);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al remover la estación' }, 400);
  }
};

import type { Context } from 'hono';
import * as kitchenStationService from '../../../services/admin/config-local/kitchen-station.service';

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const listKitchenStationsController = async (c: Context) => {
  try {
    const data = await kitchenStationService.listKitchenStations();
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
    const data = await kitchenStationService.getStationsForProduct(productId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener las estaciones del producto' }, 500);
  }
};

export const assignStationToProductController = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id') || '0');
    const { stationId } = await c.req.json();
    const result = await kitchenStationService.assignStationToProduct(productId, Number(stationId));
    return c.json({ success: true, data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al asignar la estación' }, 400);
  }
};

export const unassignStationFromProductController = async (c: Context) => {
  try {
    const productId = parseInt(c.req.param('id') || '0');
    const stationId = parseInt(c.req.param('stationId') || '0');
    await kitchenStationService.unassignStationFromProduct(productId, stationId);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al remover la estación' }, 400);
  }
};

// ─── Asignación masiva por categoría ──────────────────────────────────────────

export const bulkAssignStationToCategoryController = async (c: Context) => {
  try {
    const stationId = parseInt(c.req.param('id') || '0');
    const { categoryId } = await c.req.json();

    if (!stationId || !categoryId) {
      return c.json({ success: false, message: 'Estación o categoría inválida' }, 400);
    }

    const result = await kitchenStationService.bulkAssignStationToCategory(stationId, Number(categoryId));

    return c.json({
      success: true,
      message: result.productCount === 0
        ? 'Esa categoría no tiene productos'
        : `${result.assignedCount} de ${result.productCount} productos asignados (los demás ya la tenían)`,
      data: result,
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al asignar por categoría' }, 400);
  }
};

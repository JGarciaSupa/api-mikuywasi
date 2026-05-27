import type { Context } from 'hono';
import * as purchase from '../../../services/admin/warehouse/purchase-documents.service';
import * as requisitions from '../../../services/admin/warehouse/requisitions.service';
import * as transfers from '../../../services/admin/warehouse/stock-transfers.service';
import * as exits from '../../../services/admin/warehouse/stock-exits.service';
import * as portionings from '../../../services/admin/warehouse/portionings.service';
import * as adjustments from '../../../services/admin/warehouse/inventory-adjustments.service';
import { getAuditActor, jsonError } from '@/utils/helpers';

// ─── Documentos de compra ───────────────────────────────────
export const listPurchaseDocuments = async (c: Context) => {
  try {
    const data = await purchase.listPurchaseDocuments({
      status: c.req.query('status'),
      supplierId: c.req.query('supplierId') ? parseInt(c.req.query('supplierId')!) : undefined,
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar documentos');
  }
};

export const getPurchaseDocument = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await purchase.getPurchaseDocumentById(id);
    if (!data) return c.json({ success: false, message: 'Documento no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener documento');
  }
};

export const createPurchaseDocument = async (c: Context) => {
  try {
    const { lines, ...header } = c.req.valid('json' as never) as any;
    const data = await purchase.createPurchaseDocument(header, lines, getAuditActor(c));
    return c.json({ success: true, message: 'Documento creado', data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear documento');
  }
};

export const processPurchaseDocument = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await purchase.processPurchaseDocument(id, getAuditActor(c));
    return c.json({ success: true, message: 'Documento procesado', data });
  } catch (e) {
    return jsonError(c, e, 'Error al procesar documento');
  }
};

export const voidPurchaseDocument = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await purchase.voidPurchaseDocument(id, getAuditActor(c));
    return c.json({ success: true, message: 'Documento anulado', data });
  } catch (e) {
    return jsonError(c, e, 'Error al anular documento');
  }
};

export const updatePurchaseDocument = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const { lines, ...header } = await c.req.json();
    const data = await purchase.updatePurchaseDocument(id, header, lines, getAuditActor(c));
    return c.json({ success: true, message: 'Documento actualizado', data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar documento');
  }
};

// ─── Requerimientos ─────────────────────────────────────────
export const listRequisitions = async (c: Context) => {
  try {
    const data = await requisitions.listRequisitions({
      status: c.req.query('status'),
      areaId: c.req.query('areaId') ? parseInt(c.req.query('areaId')!) : undefined,
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar requerimientos');
  }
};

export const createRequisition = async (c: Context) => {
  try {
    const { lines, ...header } = c.req.valid('json' as never) as any;
    const data = await requisitions.createRequisition(header, lines, getAuditActor(c));
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear requerimiento');
  }
};

export const getRequisition = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await requisitions.getRequisitionById(id);
    if (!data) return c.json({ success: false, message: 'Requerimiento no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener requerimiento');
  }
};

export const voidRequisition = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await requisitions.voidRequisition(id, getAuditActor(c));
    return c.json({ success: true, message: 'Requerimiento anulado', data });
  } catch (e) {
    return jsonError(c, e, 'Error al anular requerimiento');
  }
};

export const processRequisition = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await requisitions.processRequisition(id, getAuditActor(c));
    return c.json({ success: true, message: 'Requerimiento procesado', data });
  } catch (e) {
    return jsonError(c, e, 'Error al procesar requerimiento');
  }
};

// ─── Transferencias ─────────────────────────────────────────
export const listStockTransfers = async (c: Context) => {
  try {
    const data = await transfers.listStockTransfers({ status: c.req.query('status') });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar transferencias');
  }
};

export const createStockTransfer = async (c: Context) => {
  try {
    const { lines, ...header } = c.req.valid('json' as never) as any;
    const data = await transfers.createStockTransfer(header, lines, getAuditActor(c));
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear transferencia');
  }
};

export const getStockTransfer = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await transfers.getStockTransferById(id);
    if (!data) return c.json({ success: false, message: 'Transferencia no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener transferencia');
  }
};

export const voidStockTransfer = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await transfers.voidStockTransfer(id, getAuditActor(c));
    return c.json({ success: true, message: 'Transferencia anulada', data });
  } catch (e) {
    return jsonError(c, e, 'Error al anular transferencia');
  }
};

export const processStockTransfer = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await transfers.processStockTransfer(id, getAuditActor(c));
    return c.json({ success: true, message: 'Transferencia procesada', data });
  } catch (e) {
    return jsonError(c, e, 'Error al procesar transferencia');
  }
};

// ─── Salidas ────────────────────────────────────────────────
export const listStockExits = async (c: Context) => {
  try {
    const data = await exits.listStockExits({
      status: c.req.query('status'),
      areaId: c.req.query('areaId') ? parseInt(c.req.query('areaId')!) : undefined,
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar salidas');
  }
};

export const createStockExit = async (c: Context) => {
  try {
    const { lines, ...header } = c.req.valid('json' as never) as any;
    const data = await exits.createStockExit(header, lines, getAuditActor(c));
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear salida');
  }
};

export const getStockExit = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await exits.getStockExitById(id);
    if (!data) return c.json({ success: false, message: 'Salida no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener salida');
  }
};

export const voidStockExit = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await exits.voidStockExit(id, getAuditActor(c));
    return c.json({ success: true, message: 'Salida anulada', data });
  } catch (e) {
    return jsonError(c, e, 'Error al anular salida');
  }
};

export const processStockExit = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await exits.processStockExit(id, getAuditActor(c));
    return c.json({ success: true, message: 'Salida procesada', data });
  } catch (e) {
    return jsonError(c, e, 'Error al procesar salida');
  }
};

// ─── Porcionamientos ────────────────────────────────────────
export const listPortionings = async (c: Context) => {
  try {
    const data = await portionings.listPortionings({
      status: c.req.query('status'),
      areaId: c.req.query('areaId') ? parseInt(c.req.query('areaId')!) : undefined,
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar porcionamientos');
  }
};

export const createPortioning = async (c: Context) => {
  try {
    const { lines, ...header } = c.req.valid('json' as never) as any;
    const data = await portionings.createPortioning(header, lines, getAuditActor(c));
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear porcionamiento');
  }
};

export const getPortioning = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await portionings.getPortioningById(id);
    if (!data) return c.json({ success: false, message: 'Porcionamiento no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener porcionamiento');
  }
};

export const voidPortioning = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await portionings.voidPortioning(id, getAuditActor(c));
    return c.json({ success: true, message: 'Porcionamiento anulado', data });
  } catch (e) {
    return jsonError(c, e, 'Error al anular porcionamiento');
  }
};

export const processPortioning = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await portionings.processPortioning(id, getAuditActor(c));
    return c.json({ success: true, message: 'Porcionamiento procesado', data });
  } catch (e) {
    return jsonError(c, e, 'Error al procesar porcionamiento');
  }
};

// ─── Ajustes de inventario ──────────────────────────────────
export const listAdjustments = async (c: Context) => {
  try {
    const data = await adjustments.listInventoryAdjustments({
      status: c.req.query('status'),
      areaId: c.req.query('areaId') ? parseInt(c.req.query('areaId')!) : undefined,
    });
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar ajustes');
  }
};

export const getAdjustment = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await adjustments.getInventoryAdjustmentById(id);
    if (!data) return c.json({ success: false, message: 'Ajuste no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener ajuste');
  }
};

export const openAdjustment = async (c: Context) => {
  try {
    const body = c.req.valid('json' as never);
    const data = await adjustments.openInventoryAdjustment(body, getAuditActor(c));
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al abrir ajuste');
  }
};

export const updateAdjustmentLines = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const { lines } = c.req.valid('json' as never);
    const data = await adjustments.updateAdjustmentLines(id, lines);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar líneas de ajuste');
  }
};

export const closeAdjustment = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0', 10);
    const data = await adjustments.closeInventoryAdjustment(id, getAuditActor(c));
    return c.json({ success: true, message: 'Ajuste cerrado', data });
  } catch (e) {
    return jsonError(c, e, 'Error al cerrar ajuste');
  }
};

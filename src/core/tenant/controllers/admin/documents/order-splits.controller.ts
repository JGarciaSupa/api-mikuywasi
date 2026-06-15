import type { Context } from 'hono';
import * as splitsService from '../../../services/admin/documents/order-splits.service';

export const listSplitsController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    const splits = await splitsService.listSplits(orderId);
    return c.json({ success: true, data: splits });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al listar cuentas' }, 500);
  }
};

export const createSplitController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    const { label } = await c.req.json();
    const split = await splitsService.createSplit({ orderId, label: label || 'Cuenta' });
    return c.json({ success: true, data: split }, 201);
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404
      : error.message?.includes('cancelado') || error.message?.includes('completado') ? 422
      : 500;
    return c.json({ success: false, message: error.message || 'Error al crear cuenta' }, status as any);
  }
};

export const updateSplitLabelController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    const splitId = Number(c.req.param('splitId'));
    const { label } = await c.req.json();
    const split = await splitsService.updateSplitLabel(splitId, orderId, label);
    return c.json({ success: true, data: split });
  } catch (error: any) {
    const status = error.message?.includes('no encontrada') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al actualizar cuenta' }, status as any);
  }
};

export const assignItemsController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    const body = await c.req.json();
    const itemIds: number[] = body.itemIds;
    const splitId: number | null = body.splitId ?? null;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return c.json({ success: false, message: 'Se requiere itemIds (array no vacío)' }, 400);
    }

    const splits = await splitsService.assignItems(orderId, { itemIds, splitId });
    return c.json({ success: true, data: splits });
  } catch (error: any) {
    const status = error.message?.includes('no pertenece') || error.message?.includes('no encontrada') ? 404
      : error.message?.includes('facturada') || error.message?.includes('emitido') ? 422
      : 500;
    return c.json({ success: false, message: error.message || 'Error al asignar ítems' }, status as any);
  }
};

export const updateSplitPaymentController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    const splitId = Number(c.req.param('splitId'));
    const { paymentStatus, paymentMethod } = await c.req.json();

    if (!['unpaid', 'paid', 'review_pending'].includes(paymentStatus)) {
      return c.json({ success: false, message: 'Estado de pago inválido' }, 400);
    }

    const split = await splitsService.updateSplitPayment(splitId, orderId, { paymentStatus, paymentMethod });
    return c.json({ success: true, data: split });
  } catch (error: any) {
    const status = error.message?.includes('no encontrada') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al actualizar pago' }, status as any);
  }
};

export const splitItemQtyController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    const { itemId, qty, splitId } = await c.req.json();

    if (!itemId || !qty) {
      return c.json({ success: false, message: 'Se requieren itemId y qty' }, 400);
    }

    const splits = await splitsService.splitItemQuantity(orderId, Number(itemId), Number(qty), splitId ?? null);
    return c.json({ success: true, data: splits });
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') || error.message?.includes('no pertenece') ? 404
      : error.message?.includes('menor') || error.message?.includes('entero') ? 422
      : 500;
    return c.json({ success: false, message: error.message || 'Error al dividir ítem' }, status as any);
  }
};

export const deleteSplitController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    const splitId = Number(c.req.param('splitId'));
    await splitsService.deleteSplit(splitId, orderId);
    return c.json({ success: true });
  } catch (error: any) {
    const status = error.message?.includes('no encontrada') ? 404
      : error.message?.includes('comprobante') ? 422
      : 500;
    return c.json({ success: false, message: error.message || 'Error al eliminar cuenta' }, status as any);
  }
};

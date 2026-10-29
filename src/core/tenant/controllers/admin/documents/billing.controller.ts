import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import * as billingService from '../../../services/admin/documents/billing.service';
import * as billingSeriesService from '../../../services/admin/documents/billing-series.service';
import { convertirCertificado } from '../../../../../utils/facturador-client';
import { hasPermission, hasPermissionLive } from '@/utils/permissions';
import { getAuditActor } from '@/utils/helpers';

// Permiso para marcar ventas como pago pendiente y marcarlas como cobradas
const PENDING_PAYMENT_PERMISSION = 'facturacion.pago_pendiente';

// ── Series ────────────────────────────────────────────────────────────────────

export const listSeriesController = async (c: Context) => {
  try {
    const branchIdStr = c.req.query('branchId');
    const branchId = branchIdStr && !isNaN(Number(branchIdStr)) ? Number(branchIdStr) : undefined;
    const data = await billingSeriesService.listSeries(branchId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al listar series') }, 500);
  }
};

export const createSeriesController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const row = await billingSeriesService.createSeries(body);
    return c.json({ success: true, data: row }, 201);
  } catch (error: any) {
    const status = error.message?.includes('unique') || error.code === '23505' ? 409 : 500;
    return c.json({ success: false, message: safeMessage(error, 'Error al crear serie') }, status as any);
  }
};

export const updateSeriesController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const row = await billingSeriesService.updateSeries(id, body);
    return c.json({ success: true, data: row });
  } catch (error: any) {
    const status = error.message?.includes('no encontrada') ? 404 : 500;
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar serie') }, status as any);
  }
};

export const deleteSeriesController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    await billingSeriesService.deleteSeries(id);
    return c.json({ success: true });
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrada') ? 404 :
        error.message?.includes('documentos activos') ? 409 :
          500;
    return c.json({ success: false, message: safeMessage(error, 'Error al eliminar serie') }, status as any);
  }
};

// ── Series por caja (Caja ↔ Documento ↔ Serie) ─────────────────────────────────

export const listRegisterSeriesController = async (c: Context) => {
  try {
    const registerId = Number(c.req.param('registerId'));
    const data = await billingSeriesService.listSeriesForRegister(registerId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al listar series de la caja') }, 500);
  }
};

export const assignRegisterSeriesController = async (c: Context) => {
  try {
    const registerId = Number(c.req.param('registerId'));
    const { documentType, seriesId } = await c.req.json();
    const row = await billingSeriesService.assignSeriesToRegister(registerId, documentType, Number(seriesId));
    return c.json({ success: true, data: row });
  } catch (error: any) {
    const status = error.message?.includes('no encontrada') || error.message?.includes('no encontrado') ? 404 : 422;
    return c.json({ success: false, message: safeMessage(error, 'Error al asignar serie a la caja') }, status as any);
  }
};

// Crea/enlaza un documento (serie + correlativo + nombre custom) a una caja, con
// el tipo tomado del catálogo maestro (receiptTypeCode).
export const createRegisterDocumentController = async (c: Context) => {
  try {
    const registerId = Number(c.req.param('registerId'));
    const { seriesId, receiptTypeCode, series, initialCorrelative, description, isActive, isActiveFacturacion } = await c.req.json();

    const row = await billingSeriesService.createOrLinkRegisterDocument({
      registerId,
      seriesId: seriesId ? Number(seriesId) : undefined,
      receiptTypeCode,
      series,
      initialCorrelative: initialCorrelative != null ? Number(initialCorrelative) : undefined,
      description,
      isActive,
      isActiveFacturacion,
    });
    return c.json({ success: true, data: row }, 201);
  } catch (error: any) {
    if (error.code === '23505' || error.message?.includes('duplicate key')) {
      return c.json({ success: false, message: 'La serie ingresada ya se encuentra registrada o en conflicto con una existente. Intente con otra numeración.' }, 409);
    }
    const status = error.message?.includes('no encontrada') || error.message?.includes('no encontrado') ? 404
      : error.message?.includes('ya está en uso') || error.message?.includes('Ya existe') ? 409
      : 422;
    return c.json({ success: false, message: safeMessage(error, 'Error al crear el documento de la caja') }, status as any);
  }
};

export const unassignRegisterSeriesController = async (c: Context) => {
  try {
    const registerId = Number(c.req.param('registerId'));
    const documentType = c.req.param('documentType') as 'factura' | 'boleta' | 'nota_de_venta';
    await billingSeriesService.unassignSeriesFromRegister(registerId, documentType);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al quitar serie de la caja') }, 500);
  }
};

// ── Documents ─────────────────────────────────────────────────────────────────

export const listDocumentsController = async (c: Context) => {
  try {
    const q = c.req.query();
    const result = await billingService.listDocuments({
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
      branchId: q.branchId ? Number(q.branchId) : undefined,
      documentType: q.documentType,
      includeRelated: q.includeRelated === 'true',
      status: q.status,
      orderId: q.orderId,
      startDate: q.startDate,
      endDate: q.endDate,
      buyerDoc: q.buyerDoc,
      search: q.search,
      paymentPending: q.paymentPending === 'true',
    });
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al listar documentos') }, 500);
  }
};

export const getAvailableDocumentTypesController = async (c: Context) => {
  try {
    const payload = c.get('jwtPayload') as { userId?: number } | undefined;
    const data = await billingService.getAvailableDocumentTypes(payload?.userId);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('turno de caja') ? 422 : 500;
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener tipos de comprobante disponibles') }, status as any);
  }
};

export const getDocumentController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const doc = await billingService.getDocumentById(id);
    if (!doc) return c.json({ success: false, message: 'Documento no encontrado' }, 404);
    return c.json({ success: true, data: doc });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener documento') }, 500);
  }
};

export const getRelatedDocumentsController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await billingService.getRelatedDocuments(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404 : 500;
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener documentos relacionados') }, status as any);
  }
};

export const previewDocumentController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const documentType = c.req.query('documentType') as 'factura' | 'boleta' | 'nota_de_venta' | undefined;
    if (!documentType) return c.json({ success: false, message: 'Se requiere documentType como query param' }, 400);
    const splitIdRaw = c.req.query('splitId');
    const splitId = splitIdRaw != null ? Number(splitIdRaw) : null;
    const payload = c.get('jwtPayload') as { userId?: number } | undefined;
    const preview = await billingService.previewDocument(orderId, documentType, payload?.userId, splitId);
    return c.json({ success: true, data: preview });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') || error.message?.includes('no encontrada') ? 404
      : error.message?.includes('pagada') || error.message?.includes('pagado') ? 422
      : error.message?.includes('turno de caja') || error.message?.includes('serie configurada') ? 422
      : 500;
    return c.json({ success: false, message: safeMessage(error, 'Error al previsualizar documento') }, status as any);
  }
};

export const createDocumentController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const payload = c.get('jwtPayload') as { userId?: number; username?: string } | undefined;
    if (body.paymentPending === true && !(await hasPermissionLive(c, PENDING_PAYMENT_PERMISSION))) {
      return c.json({ success: false, message: 'No tienes permiso para registrar ventas con pago pendiente' }, 403);
    }
    const result = await billingService.createDocument({
      ...body,
      splitId: body.splitId ?? null,
      createdBy: payload?.username ?? null,
      userId: payload?.userId,
    });
    return c.json({ success: true, data: result }, 201);
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') || error.message?.includes('no encontrada') ? 404 :
        error.message?.includes('ya tiene un documento') ? 409 :
          error.message?.includes('requiere') || error.message?.includes('pagada') || error.message?.includes('pagado')
            || error.message?.includes('turno de caja') || error.message?.includes('serie configurada')
            || error.message?.includes('Tipo de documento') || error.message?.includes('formato inválido')
            || error.message?.includes('debe tener')
            || error.message?.includes('pago pendiente') ? 422 :
            500;
    return c.json({ success: false, message: safeMessage(error, 'Error al crear documento') }, status as any);
  }
};

export const voidDocumentController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const { reason, cancelOrder, password } = await c.req.json();
    if (cancelOrder === true && !hasPermission(c, 'pedidos.anular') && !hasPermission(c, 'mozo.cancelar_pedido')) {
      return c.json({ success: false, message: 'No tienes permisos para anular también el pedido' }, 403);
    }
    const actor = getAuditActor(c);
    const updated = await billingService.voidDocument(id, reason, cancelOrder === true, password, actor);
    // El service ya escribe su propio registro (VOID) en audit_log
    c.set('auditLogged', true);
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') ? 404 :
        error.message?.includes('Contraseña') || error.message?.includes('autorizado') ? 403 :
          error.message?.includes('No se puede') ? 422 :
            error.message?.includes('motivo') ? 400 :
              500;
    return c.json({ success: false, message: safeMessage(error, 'Error al anular documento') }, status as any);
  }
};

export const checkVoidStatusController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const updated = await billingService.checkVoidStatus(id);
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') ? 404 :
        error.message?.includes('Solo se puede') || error.message?.includes('no tiene') ? 422 :
          500;
    return c.json({ success: false, message: safeMessage(error, 'Error al consultar estado de baja') }, status as any);
  }
};

export const retryVoidSunatController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const updated = await billingService.retryVoidSunat(id);
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') ? 404 :
        error.message?.includes('Solo se puede') || error.message?.includes('no fue aceptado') || error.message?.includes('ya fue enviada') ? 422 :
          500;
    return c.json({ success: false, message: safeMessage(error, 'Error al reintentar comunicación de baja') }, status as any);
  }
};

export const retryDocumentController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const result = await billingService.retryDocument(id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') ? 404 :
        error.message?.includes('anulado') || error.message?.includes('aceptado') || error.message?.includes('notas de venta') ? 422 :
          500;
    return c.json({ success: false, message: safeMessage(error, 'Error al reintentar envío') }, status as any);
  }
};

export const convertCertificateController = async (c: Context) => {
  try {
    const { p12Base64, password } = await c.req.json();
    console.log('[cert-convert] received', { p12Len: p12Base64?.length, passLen: password?.length, passHex: password ? Buffer.from(password).toString('hex') : null });
    if (!p12Base64 || !password) {
      return c.json({ success: false, message: 'Se requieren p12Base64 y password' }, 400);
    }
    const result = await convertirCertificado(p12Base64, password);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message?.includes('contraseña') || error.message?.includes('P12')
        ? 'No se pudo leer el certificado. Verifica que el archivo y la contraseña sean correctos.'
        : error.message || 'Error al convertir el certificado',
    }, 422);
  }
};

export const correctAndRetryController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const buyer = await c.req.json();
    const result = await billingService.correctAndRetryDocument(id, buyer);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') ? 404 :
        error.message?.includes('aceptado') || error.message?.includes('anulado') || error.message?.includes('notas') ? 422 :
          error.message?.includes('requiere') ? 400 :
            500;
    return c.json({ success: false, message: safeMessage(error, 'Error al corregir el documento') }, status as any);
  }
};

export const diagnoseDocumentController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const result = await billingService.diagnoseDocument(id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404 : 500;
    return c.json({ success: false, message: safeMessage(error, 'Error al diagnosticar documento') }, status as any);
  }
};

export const getDocumentReceiptController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const payload = c.get('jwtPayload') as { userId?: number } | undefined;
    const data = await billingService.getDocumentReceipt(id, payload?.userId);
    if (!data) return c.json({ success: false, message: 'Documento no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener datos del comprobante') }, 500);
  }
};

export const getDocumentPdfController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const pdfBuffer = await billingService.getDocumentPdf(id);
    c.res.headers.set('Content-Type', 'application/pdf');
    c.res.headers.set('Content-Disposition', `attachment; filename="comprobante-${id}.pdf"`);
    return c.body(pdfBuffer as any);
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') ? 404 :
        error.message?.includes('no tiene') ? 422 :
          500;
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener PDF') }, status as any);
  }
};

export const createNotaCreditoDirectaController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const { motivo, motivoDescripcion, notes } = body;

    if (!motivo || !motivoDescripcion) {
      return c.json({ success: false, message: 'El motivo y su descripción son requeridos' }, 400);
    }

    const result = await billingService.emitirNotaCreditoDirecta(
      id,
      motivo,
      motivoDescripcion,
      notes,
      (c as any).get?.('user')?.username,
    );

    if (result.document.sunatStatus !== 'ACEPTADO') {
      return c.json(
        {
          success: false,
          message: `SUNAT no aceptó la Nota de Crédito: ${result.document.sunatMessage ?? 'sin detalle'}`,
          data: result,
        },
        422 as any,
      );
    }

    return c.json({ success: true, data: result });
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') ? 404 :
      error.message?.includes('anulado') || error.message?.includes('aceptado') || error.message?.includes('Solo') ? 422 :
      500;
    return c.json({ success: false, message: safeMessage(error, 'Error al emitir Nota de Crédito') }, status as any);
  }
};

export const createNotaCreditoExternaController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const result = await billingService.emitirNotaCreditoExterna(body);
    if (!result.success) {
      return c.json(
        { success: false, message: result.data?.responseMessage ?? 'Facturador rechazó la Nota de Crédito', data: result },
        422 as any,
      );
    }
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al emitir Nota de Crédito externa') }, 500);
  }
};

export const markDocumentCollectedController = async (c: Context) => {
  try {
    if (!(await hasPermissionLive(c, PENDING_PAYMENT_PERMISSION))) {
      return c.json({ success: false, message: 'No tienes permiso para marcar cobros pendientes' }, 403);
    }
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, message: 'ID inválido' }, 400);
    const payload = c.get('jwtPayload') as { username?: string } | undefined;
    // Body opcional (retrocompatible): forma de pago real con la que pagó el cliente y su REF
    const body = await c.req.json().catch(() => ({})) as { paymentMethodId?: unknown; reference?: unknown };
    const paymentMethodId = body.paymentMethodId == null ? null : Number(body.paymentMethodId);
    if (paymentMethodId != null && (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0)) {
      return c.json({ success: false, message: 'Método de pago inválido' }, 400);
    }
    const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
    if (reference.length > 50) return c.json({ success: false, message: 'La referencia admite máximo 50 caracteres' }, 400);
    const data = await billingService.markDocumentCollected(id, payload?.username ?? null, { paymentMethodId, reference: reference || null });
    return c.json({ success: true, data, message: 'Cobro registrado' });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404 : 422;
    return c.json({ success: false, message: safeMessage(error, 'Error al marcar el cobro') }, status as any);
  }
};

import type { Context } from 'hono';
import * as billingService from '../../../services/admin/documents/billing.service';
import * as billingSeriesService from '../../../services/admin/documents/billing-series.service';
import { convertirCertificado } from '../../../../../utils/facturador-client';

// ── Series ────────────────────────────────────────────────────────────────────

export const listSeriesController = async (c: Context) => {
  try {
    const branchIdStr = c.req.query('branchId');
    const branchId = branchIdStr && !isNaN(Number(branchIdStr)) ? Number(branchIdStr) : undefined;
    const data = await billingSeriesService.listSeries(branchId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al listar series' }, 500);
  }
};

export const createSeriesController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const row = await billingSeriesService.createSeries(body);
    return c.json({ success: true, data: row }, 201);
  } catch (error: any) {
    const status = error.message?.includes('unique') || error.code === '23505' ? 409 : 500;
    return c.json({ success: false, message: error.message || 'Error al crear serie' }, status as any);
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
    return c.json({ success: false, message: error.message || 'Error al actualizar serie' }, status as any);
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
    return c.json({ success: false, message: error.message || 'Error al eliminar serie' }, status as any);
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
    });
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al listar documentos' }, 500);
  }
};

export const getDocumentController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const doc = await billingService.getDocumentById(id);
    if (!doc) return c.json({ success: false, message: 'Documento no encontrado' }, 404);
    return c.json({ success: true, data: doc });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener documento' }, 500);
  }
};

export const getRelatedDocumentsController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await billingService.getRelatedDocuments(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al obtener documentos relacionados' }, status as any);
  }
};

export const previewDocumentController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const seriesId = Number(c.req.query('seriesId'));
    if (!seriesId) return c.json({ success: false, message: 'Se requiere seriesId como query param' }, 400);
    const splitIdRaw = c.req.query('splitId');
    const splitId = splitIdRaw != null ? Number(splitIdRaw) : null;
    const preview = await billingService.previewDocument(orderId, seriesId, splitId);
    return c.json({ success: true, data: preview });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') || error.message?.includes('no encontrada') ? 404
      : error.message?.includes('pagada') || error.message?.includes('pagado') ? 422
      : 500;
    return c.json({ success: false, message: error.message || 'Error al previsualizar documento' }, status as any);
  }
};

export const createDocumentController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const payload = c.get('jwtPayload') as { userId?: number; username?: string } | undefined;
    const result = await billingService.createDocument({
      ...body,
      splitId: body.splitId ?? null,
      createdBy: payload?.username ?? null,
    });
    return c.json({ success: true, data: result }, 201);
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') || error.message?.includes('no encontrada') ? 404 :
        error.message?.includes('ya tiene un documento') ? 409 :
          error.message?.includes('requiere') || error.message?.includes('pagada') || error.message?.includes('pagado') ? 422 :
            500;
    return c.json({ success: false, message: error.message || 'Error al crear documento' }, status as any);
  }
};

export const voidDocumentController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const { reason, cancelOrder } = await c.req.json();
    const updated = await billingService.voidDocument(id, reason, cancelOrder === true);
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') ? 404 :
        error.message?.includes('No se puede') ? 422 :
          error.message?.includes('motivo') ? 400 :
            500;
    return c.json({ success: false, message: error.message || 'Error al anular documento' }, status as any);
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
    return c.json({ success: false, message: error.message || 'Error al consultar estado de baja' }, status as any);
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
    return c.json({ success: false, message: error.message || 'Error al reintentar comunicación de baja' }, status as any);
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
    return c.json({ success: false, message: error.message || 'Error al reintentar envío' }, status as any);
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
    return c.json({ success: false, message: error.message || 'Error al corregir el documento' }, status as any);
  }
};

export const diagnoseDocumentController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const result = await billingService.diagnoseDocument(id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al diagnosticar documento' }, status as any);
  }
};

export const getDocumentReceiptController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await billingService.getDocumentReceipt(id);
    if (!data) return c.json({ success: false, message: 'Documento no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener datos del comprobante' }, 500);
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
    return c.json({ success: false, message: error.message || 'Error al obtener PDF' }, status as any);
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
    return c.json({ success: false, message: error.message || 'Error al emitir Nota de Crédito' }, status as any);
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
    return c.json({ success: false, message: error.message || 'Error al emitir Nota de Crédito externa' }, 500);
  }
};

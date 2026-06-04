import type { Context } from 'hono';
import * as billingService from '../../../services/admin/documents/billing.service';
import * as billingSeriesService from '../../../services/admin/documents/billing-series.service';
import { convertirCertificado } from '../../../../../utils/facturador-client';

// ── Series ────────────────────────────────────────────────────────────────────

export const listSeriesController = async (c: Context) => {
  try {
    const data = await billingSeriesService.listSeries();
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

// ── Documents ─────────────────────────────────────────────────────────────────

export const listDocumentsController = async (c: Context) => {
  try {
    const q = c.req.query();
    const result = await billingService.listDocuments({
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
      documentType: q.documentType,
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

export const previewDocumentController = async (c: Context) => {
  try {
    const orderId = c.req.param('orderId');
    if (!orderId) {
      return c.json({ success: false, message: 'ID de pedido requerido' }, 400);
    }
    const seriesId = Number(c.req.query('seriesId'));
    if (!seriesId) return c.json({ success: false, message: 'Se requiere seriesId como query param' }, 400);
    const preview = await billingService.previewDocument(orderId, seriesId);
    return c.json({ success: true, data: preview });
  } catch (error: any) {
    const status = error.message?.includes('no encontrado') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al previsualizar documento' }, status as any);
  }
};

export const createDocumentController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const payload = c.get('jwtPayload') as { userId?: number; username?: string } | undefined;
    const result = await billingService.createDocument({
      ...body,
      createdBy: payload?.username ?? null,
    });
    return c.json({ success: true, data: result }, 201);
  } catch (error: any) {
    const status =
      error.message?.includes('no encontrado') ? 404 :
        error.message?.includes('ya tiene un documento') ? 409 :
          error.message?.includes('requiere') ? 422 :
            500;
    return c.json({ success: false, message: error.message || 'Error al crear documento' }, status as any);
  }
};

export const voidDocumentController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const { reason } = await c.req.json();
    const updated = await billingService.voidDocument(id, reason);
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

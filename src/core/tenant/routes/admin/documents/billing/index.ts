import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  listSeriesController,
  createSeriesController,
  updateSeriesController,
  deleteSeriesController,
  listRegisterSeriesController,
  assignRegisterSeriesController,
  unassignRegisterSeriesController,
  createRegisterDocumentController,
  listDocumentsController,
  getAvailableDocumentTypesController,
  getDocumentController,
  getRelatedDocumentsController,
  getDocumentReceiptController,
  previewDocumentController,
  createDocumentController,
  voidDocumentController,
  checkVoidStatusController,
  retryVoidSunatController,
  retryDocumentController,
  correctAndRetryController,
  getDocumentPdfController,
  convertCertificateController,
  diagnoseDocumentController,
  createNotaCreditoDirectaController,
  createNotaCreditoExternaController,
} from '../../../../controllers/admin/documents/billing.controller';
import {
  getBillingReportSummaryController,
  getBillingReportBreakdownController,
  getBillingReportExportController,
} from '../../../../controllers/admin/documents/billing-reports.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

// Reportes agregados
routes.get('/reports/summary', getBillingReportSummaryController);
routes.get('/reports/breakdown', getBillingReportBreakdownController);
routes.get('/reports/export', getBillingReportExportController);

// Series
routes.get('/series', listSeriesController);
routes.post('/series', createSeriesController);
routes.put('/series/:id', updateSeriesController);
routes.delete('/series/:id', deleteSeriesController);

// Series por caja
routes.get('/series/registers/:registerId', listRegisterSeriesController);
routes.post('/series/registers/:registerId', assignRegisterSeriesController);
routes.post('/series/registers/:registerId/document', createRegisterDocumentController);
routes.delete('/series/registers/:registerId/:documentType', unassignRegisterSeriesController);

// Certificate conversion proxy
routes.post('/certificate/convert', convertCertificateController);

// Documents
routes.get('/documents/available-types', getAvailableDocumentTypesController);
routes.get('/documents', listDocumentsController);
routes.get('/documents/:id', getDocumentController);
routes.get('/documents/:id/related', getRelatedDocumentsController);
routes.get('/documents/:id/receipt', getDocumentReceiptController);
routes.put('/documents/:id/correct', correctAndRetryController);
routes.get('/documents/:id/pdf', getDocumentPdfController);
routes.get('/preview/:orderId', previewDocumentController);
routes.post('/documents', createDocumentController);
routes.post('/documents/:id/void-status', checkVoidStatusController);
routes.post('/documents/:id/void-retry', retryVoidSunatController);
routes.post('/documents/:id/void', voidDocumentController);
routes.post('/documents/:id/retry', retryDocumentController);
routes.get('/documents/:id/diagnose', diagnoseDocumentController);
routes.post('/documents/:id/credit-note', createNotaCreditoDirectaController);
routes.post('/credit-note/external', createNotaCreditoExternaController);

export default routes;

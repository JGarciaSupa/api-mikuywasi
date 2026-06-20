import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  listSeriesController,
  createSeriesController,
  updateSeriesController,
  deleteSeriesController,
  listDocumentsController,
  getDocumentController,
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
} from '../../../../controllers/admin/documents/billing.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

// Series
routes.get('/series', listSeriesController);
routes.post('/series', createSeriesController);
routes.put('/series/:id', updateSeriesController);
routes.delete('/series/:id', deleteSeriesController);

// Certificate conversion proxy
routes.post('/certificate/convert', convertCertificateController);

// Documents
routes.get('/documents', listDocumentsController);
routes.get('/documents/:id', getDocumentController);
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

export default routes;

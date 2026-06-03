import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../../middleware/auth.middleware';
import {
  listSeriesController,
  createSeriesController,
  updateSeriesController,
  listDocumentsController,
  getDocumentController,
  getDocumentReceiptController,
  previewDocumentController,
  createDocumentController,
  voidDocumentController,
  retryDocumentController,
  getDocumentPdfController,
  convertCertificateController,
} from '../../../../controllers/admin/documents/billing.controller';

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('*', roleMiddleware(['admin']));

// Series
routes.get('/series', listSeriesController);
routes.post('/series', createSeriesController);
routes.put('/series/:id', updateSeriesController);

// Certificate conversion proxy
routes.post('/certificate/convert', convertCertificateController);

// Documents
routes.get('/documents', listDocumentsController);
routes.get('/documents/:id', getDocumentController);
routes.get('/documents/:id/receipt', getDocumentReceiptController);
routes.get('/documents/:id/pdf', getDocumentPdfController);
routes.get('/preview/:orderId', previewDocumentController);
routes.post('/documents', createDocumentController);
routes.post('/documents/:id/void', voidDocumentController);
routes.post('/documents/:id/retry', retryDocumentController);

export default routes;

import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../../middleware/auth.middleware';
import {
  listSeriesController,
  createSeriesController,
  updateSeriesController,
  listDocumentsController,
  getDocumentController,
  previewDocumentController,
  createDocumentController,
  voidDocumentController,
} from '../../../../controllers/admin/documents/billing.controller';

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('*', roleMiddleware(['admin']));

// Series
routes.get('/series', listSeriesController);
routes.post('/series', createSeriesController);
routes.put('/series/:id', updateSeriesController);

// Documents
routes.get('/documents', listDocumentsController);
routes.get('/documents/:id', getDocumentController);
routes.get('/preview/:orderId', previewDocumentController);
routes.post('/documents', createDocumentController);
routes.post('/documents/:id/void', voidDocumentController);

export default routes;

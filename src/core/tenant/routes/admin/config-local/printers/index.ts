import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreatePrinter,
  validateUpdatePrinter,
} from '../../../../validations/admin/config-local/printer.validation';
import {
  listPrintersController,
  getPrinterByIdController,
  createPrinterController,
  updatePrinterController,
  deletePrinterController,
} from '../../../../controllers/admin/config-local/printer.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', listPrintersController);
routes.get('/:id', getPrinterByIdController);
routes.post('/', validateCreatePrinter, createPrinterController);
routes.patch('/:id', validateUpdatePrinter, updatePrinterController);
routes.delete('/:id', deletePrinterController);

export default routes;

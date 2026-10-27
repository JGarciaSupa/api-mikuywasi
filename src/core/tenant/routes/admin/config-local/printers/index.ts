import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
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

// Leer impresoras lo necesitan POS, caja y facturación para imprimir; solo se protege la gestión
const canManagePrinters = requirePermission('administracion', 'administracion.impresoras');

routes.use('*', authMiddleware);

routes.get('/', listPrintersController);
routes.get('/:id', getPrinterByIdController);
routes.post('/', canManagePrinters, validateCreatePrinter, createPrinterController);
routes.patch('/:id', canManagePrinters, validateUpdatePrinter, updatePrinterController);
routes.delete('/:id', canManagePrinters, deletePrinterController);

export default routes;

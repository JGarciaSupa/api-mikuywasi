import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as ReceiptTypesController from '../controllers/receipt-types.controller';
import { createReceiptTypeSchema, updateReceiptTypeSchema } from '../validations/receipt-types.validation';
import { masterAuthMiddleware } from '../middleware/auth.middleware';

const receiptTypesRoutes = new Hono();

receiptTypesRoutes.use('*', masterAuthMiddleware);

receiptTypesRoutes.get('/', ReceiptTypesController.getReceiptTypes);
receiptTypesRoutes.get('/:id', ReceiptTypesController.getReceiptTypeById);
receiptTypesRoutes.post('/', zValidator('json', createReceiptTypeSchema), ReceiptTypesController.createReceiptType);
receiptTypesRoutes.patch('/:id', zValidator('json', updateReceiptTypeSchema), ReceiptTypesController.updateReceiptType);
receiptTypesRoutes.delete('/:id', ReceiptTypesController.deleteReceiptType);

export default receiptTypesRoutes;

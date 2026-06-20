import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreatePaymentMethod,
  validateUpdatePaymentMethod
} from '../../../../validations/admin/config-local/payment-method.validation';
import {
  createPaymentMethodController,
  deletePaymentMethodController,
  getAllPaymentMethodsController,
  getPaymentMethodByIdController,
  updatePaymentMethodController
} from '../../../../controllers/admin/config-local/payment-method.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', getAllPaymentMethodsController);
routes.get('/:id', getPaymentMethodByIdController);
routes.post('/', validateCreatePaymentMethod, createPaymentMethodController);
routes.patch('/:id', validateUpdatePaymentMethod, updatePaymentMethodController);
routes.delete('/:id', deletePaymentMethodController);

export default routes;

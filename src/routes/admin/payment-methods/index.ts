import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { 
  validateCreatePaymentMethod, 
  validateUpdatePaymentMethod 
} from '../../../validations/admin/payment-method.validation';
import { 
  createPaymentMethodController, 
  deletePaymentMethodController, 
  getAllPaymentMethodsController, 
  getPaymentMethodByIdController, 
  updatePaymentMethodController 
} from '../../../controllers/admin/payment-method.controller';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';

const routes = new Hono();

const paymentMethodsLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', paymentMethodsLimiter, getAllPaymentMethodsController);
routes.get('/:id', paymentMethodsLimiter, getPaymentMethodByIdController);
routes.post('/', paymentMethodsLimiter, validateCreatePaymentMethod, createPaymentMethodController);
routes.patch('/:id', paymentMethodsLimiter, validateUpdatePaymentMethod, updatePaymentMethodController);
routes.delete('/:id', paymentMethodsLimiter, deletePaymentMethodController);

export default routes;

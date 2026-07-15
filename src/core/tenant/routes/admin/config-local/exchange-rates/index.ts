import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreateExchangeRate,
  validateUpdateExchangeRate
} from '../../../../validations/admin/config-local/exchange-rate.validation';
import {
  createExchangeRateController,
  deleteExchangeRateController,
  getAllExchangeRatesController,
  getExchangeRateByIdController,
  updateExchangeRateController
} from '../../../../controllers/admin/config-local/exchange-rate.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', getAllExchangeRatesController);
routes.get('/:id', getExchangeRateByIdController);
routes.post('/', validateCreateExchangeRate, createExchangeRateController);
routes.patch('/:id', validateUpdateExchangeRate, updateExchangeRateController);
routes.delete('/:id', deleteExchangeRateController);

export default routes;

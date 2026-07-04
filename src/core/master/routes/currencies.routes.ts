import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateCreateCurrency, validateUpdateCurrency } from '../validations/currencies.validation';
import {
  getAllCurrenciesController,
  getCurrencyByIdController,
  createCurrencyController,
  updateCurrencyController,
  deleteCurrencyController,
} from '../controllers/currencies.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllCurrenciesController);
router.post('/', validateCreateCurrency, createCurrencyController);
router.get('/:id', getCurrencyByIdController);
router.patch('/:id', validateUpdateCurrency, updateCurrencyController);
router.delete('/:id', deleteCurrencyController);

export default router;
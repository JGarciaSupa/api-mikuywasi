import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateCreateCountry, validateUpdateCountry } from '../validations/countries.validation';
import {
  getAllCountriesController,
  getCountryByIdController,
  createCountryController,
  updateCountryController,
  deleteCountryController,
} from '../controllers/countries.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllCountriesController);
router.post('/', validateCreateCountry, createCountryController);
router.get('/:id', getCountryByIdController);
router.patch('/:id', validateUpdateCountry, updateCountryController);
router.delete('/:id', deleteCountryController);

export default router;

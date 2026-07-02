import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as CountriesController from '../controllers/countries.controller';
import { createCountrySchema, updateCountrySchema } from '../validations/countries.validation';
import { masterAuthMiddleware } from '../middleware/auth.middleware';

const countriesRoutes = new Hono();

countriesRoutes.use('*', masterAuthMiddleware);

countriesRoutes.get('/', CountriesController.getCountries);
countriesRoutes.get('/:id', CountriesController.getCountryById);
countriesRoutes.post('/', zValidator('json', createCountrySchema), CountriesController.createCountry);
countriesRoutes.patch('/:id', zValidator('json', updateCountrySchema), CountriesController.updateCountry);
countriesRoutes.delete('/:id', CountriesController.deleteCountry);

export default countriesRoutes;

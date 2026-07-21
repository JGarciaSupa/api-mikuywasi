import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import * as taxProfiles from '../../../../controllers/admin/documents/tax-profiles.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', taxProfiles.searchTaxProfilesController);
routes.get('/find', taxProfiles.findTaxProfileController);
routes.post('/resolve', taxProfiles.resolveTaxProfileController);
routes.delete('/:id', taxProfiles.deleteTaxProfileController);

export default routes;

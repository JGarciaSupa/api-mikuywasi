import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import * as customers from '../../../../controllers/admin/documents/customers.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', customers.searchCustomersController);
routes.post('/', customers.createCustomerController);
routes.get('/:id', customers.getCustomerController);
routes.patch('/:id', customers.updateCustomerController);

routes.post('/:id/contacts', customers.addContactController);
routes.delete('/:id/contacts/:contactId', customers.deleteContactController);

routes.post('/:id/addresses', customers.addAddressController);
routes.delete('/:id/addresses/:addressId', customers.deleteAddressController);

export default routes;

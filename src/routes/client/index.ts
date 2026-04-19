import { Hono } from 'hono';
import { getTenantBySlugController, getMenuByCategoryController, getTablesByTenantSlugController, getPaymentMethodsByTenantSlugController } from '../../controllers/client/tenant.controller';
import { createOrderController } from '../../controllers/client/order.controller';
import { validateCreateOrder } from '../../validations/client/order.validation';

const routes = new Hono();

// Tenant Endpoints
routes.get('/tenant/:slug', getTenantBySlugController);
routes.get('/menu/:slug', getMenuByCategoryController);
routes.get('/tables/:slug', getTablesByTenantSlugController);
routes.get('/payment-methods/:slug', getPaymentMethodsByTenantSlugController);

// Order Endpoints
routes.post('/orders', validateCreateOrder, createOrderController);

export default routes;
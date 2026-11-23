import { Hono } from 'hono';
import { getTenantInfoController, getBranchesController, getMenuController, getTablesController, getPaymentMethodsController } from '../../controllers/client/tenant.controller';
import { createOrderController, getOrderByTrackingCodeController } from '../../controllers/client/order.controller';
import { validateCreateOrder } from '../../validations/client/order.validation';
import tableSessions from './table-session';

import { clientLimiter } from '../limiter';
import { tenantContextMiddleware } from '../../middleware/tenant-context.middleware';

const routes = new Hono();

routes.use('*', tenantContextMiddleware);

// El pedido por QR limita por sesión y dispositivo, no por la IP del WiFi del local.
routes.route('/table-sessions', tableSessions);

const store = new Hono();
store.use('*', clientLimiter);
store.get('/tenant/:slug', getTenantInfoController);
store.get('/branches/:slug', getBranchesController);
store.get('/menu/:slug', getMenuController);
store.get('/tables/:slug', getTablesController);
store.get('/payment-methods/:slug', getPaymentMethodsController);
store.post('/orders', validateCreateOrder, createOrderController);
store.get('/orders/tracking/:trackingCode', getOrderByTrackingCodeController);

routes.route('/', store);

export default routes;

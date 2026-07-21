import { Hono } from 'hono';
import { getTenantInfoController, getBranchesController, getMenuController, getTablesController, getPaymentMethodsController } from '../../controllers/client/tenant.controller';
import { createOrderController, getOrderByTrackingCodeController } from '../../controllers/client/order.controller';
import { validateCreateOrder } from '../../validations/client/order.validation';

import { clientLimiter } from '../limiter';
import { tenantContextMiddleware } from '../../middleware/tenant-context.middleware';

const routes = new Hono();

routes.use('*', clientLimiter);
routes.use('*', tenantContextMiddleware);

// Tenant Endpoints
routes.get('/tenant/:slug', getTenantInfoController);
routes.get('/branches/:slug', getBranchesController);
routes.get('/menu/:slug', getMenuController);
routes.get('/tables/:slug', getTablesController);
routes.get('/payment-methods/:slug', getPaymentMethodsController);

// Order Endpoints
routes.post('/orders', validateCreateOrder, createOrderController);
routes.get('/orders/tracking/:trackingCode', getOrderByTrackingCodeController);

export default routes;

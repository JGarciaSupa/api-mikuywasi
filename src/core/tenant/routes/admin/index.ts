import { Hono } from "hono";
import auth from "./users/auth";
import categories from "./config-local/categories";
import products from "./warehouse/products";
import banners from "./config-local/banners";
import socialNetworks from "./config-local/social-networks";
import staff from "./users/staff";
import settings from "./config-local/settings";
import tables from "./config-local/tables";
import waiter from "./config-local/waiter";
import paymentMethods from "./config-local/payment-methods";
import orders from "./warehouse/orders";
import kitchen from "./config-local/kitchen";
import warehouse from "./warehouse";
import dashboard from "./config-local/dashboard";
import cash from "./documents/cash";
import rbac from "./users/rbac";
import billing from "./documents/billing";

import { adminLimiter } from "../limiter";
import { tenantContextMiddleware } from "../../middleware/tenant-context.middleware";

const routes = new Hono();

routes.use('*', adminLimiter);
routes.use('*', tenantContextMiddleware);

routes.route('/', auth);
routes.route('/categories', categories);
routes.route('/products', products);
routes.route('/banners', banners);
routes.route('/social-networks', socialNetworks);
routes.route('/staff', staff);
routes.route('/settings', settings);
routes.route('/tables', tables);
routes.route('/waiter', waiter);
routes.route('/payment-methods', paymentMethods);
routes.route('/orders', orders);
routes.route('/kitchen', kitchen);
routes.route('/warehouse', warehouse);
routes.route('/dashboard', dashboard);
routes.route('/cash', cash);
routes.route('/rbac', rbac);
routes.route('/billing', billing);

export default routes;

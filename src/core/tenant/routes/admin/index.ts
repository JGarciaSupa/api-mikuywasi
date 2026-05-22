import { Hono } from "hono";
import auth from "./auth";
import categories from "./categories";
import products from "./products";
import banners from "./banners";
import socialNetworks from "./social-networks";
import staff from "./staff";
import settings from "./settings";
import tables from "./tables";
import waiter from "./waiter";
import paymentMethods from "./payment-methods";
import orders from "./orders";
import kitchen from "./kitchen";

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

export default routes;

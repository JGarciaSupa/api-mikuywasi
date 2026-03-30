import { Hono } from "hono";
import auth from "./auth";
import plans from "./plans";
import tenants from "./tenants";

const routes = new Hono();

routes.route('/', auth);
routes.route('/plans', plans);
routes.route('/tenants', tenants);

export default routes;


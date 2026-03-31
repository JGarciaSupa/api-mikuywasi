import { Hono } from "hono";
import auth from "./auth";
import plans from "./plans";
import tenants from "./tenants";
import dashboard from "./dashboard";
import categories from "./categories";

const routes = new Hono();

routes.route('/', auth);
routes.route('/plans', plans);
routes.route('/tenants', tenants);
routes.route('/dashboard', dashboard);
routes.route('/categories', categories);


export default routes;


import { Hono } from "hono";
import auth from "./auth";
import plans from "./plans";

const routes = new Hono();

routes.route('/', auth);
routes.route('/plans', plans);

export default routes;

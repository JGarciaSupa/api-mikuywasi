import { Hono } from "hono";
import auth from "./auth";

const routes = new Hono();

routes.route('/', auth);

export default routes;

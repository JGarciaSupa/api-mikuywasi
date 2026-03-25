import { Hono } from "hono";
import auth from "./auth";
import category from "./category";
import product from "./product";
import order from "./order";
import profile from "./profile";
import banner from "./banner";

const routes = new Hono();

routes.route("/auth", auth);
routes.route("/category", category);
routes.route("/product", product);
routes.route("/order", order);
routes.route("/profile", profile);
routes.route("/banner", banner);

export default routes;

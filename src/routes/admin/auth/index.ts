import { Hono } from "hono";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { validateLogin } from "../../../validations/admin/auth.validation";
import {
  loginController,
  refreshController,
  logoutController,
  profileController
} from "../../../controllers/admin/auth.controller";

const routes = new Hono();

routes.post('/login', validateLogin, loginController);
routes.post('/refresh', refreshController);
routes.post('/logout', logoutController);
routes.get('/profile', authMiddleware, profileController);

export default routes;

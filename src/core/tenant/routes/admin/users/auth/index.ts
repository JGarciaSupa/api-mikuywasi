import { Hono } from "hono";
import { authMiddleware } from "../../../../middleware/auth.middleware";
import {
  validateLogin,
  validateUpdateProfile,
  validateUpdatePassword,
} from "../../../../validations/admin/users/auth.validation";
import {
  loginController,
  refreshController,
  logoutController,
  profileController,
  updateProfileController,
  updatePasswordController,
} from "../../../../controllers/admin/users/auth.controller";

const routes = new Hono();

routes.post('/login', validateLogin, loginController);
routes.post('/refresh', refreshController);
routes.post('/logout', logoutController);
routes.get('/profile', authMiddleware, profileController);
routes.patch('/profile', authMiddleware, validateUpdateProfile, updateProfileController);
routes.patch('/password', authMiddleware, validateUpdatePassword, updatePasswordController);

export default routes;

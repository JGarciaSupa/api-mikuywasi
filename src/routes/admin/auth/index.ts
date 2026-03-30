import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import { rateLimiter } from "hono-rate-limiter";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { validateLogin } from "../../../validations/admin/auth.validation";
import {
  loginController,
  refreshController,
  logoutController,
  profileController
} from "../../../controllers/admin/auth.controller";

const routes = new Hono();

// Rate limiter: 10 intentos por minuto por IP
const authLimiter = rateLimiter({
  windowMs: 60 * 5 * 1000, // 5 minutos
  limit: 10, // 10 intentos
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous', // Genera la key por IP
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 5 minutos'
  }
});

routes.post('/login', authLimiter, validateLogin, loginController);
routes.post('/refresh', authLimiter, refreshController);
routes.post('/logout', logoutController);
routes.get('/profile', authMiddleware, profileController);

export default routes;

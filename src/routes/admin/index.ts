import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.middleware";
import { loginController, refreshController, logoutController, profileController } from "../../controllers/admin/auth.controller";

const routes = new Hono();

// Schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Routes
routes.post('/login', zValidator('json', loginSchema), loginController);
routes.post('/refresh', refreshController);
routes.post('/logout', logoutController);
routes.get('/profile', authMiddleware, profileController);

export default routes;

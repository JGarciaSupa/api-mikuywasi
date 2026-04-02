import { Hono } from "hono";
import {
  createSocialNetworkController,
  deleteSocialNetworkController,
  getAllSocialNetworksController,
  getSocialNetworkByIdController,
  reorderSocialNetworksController,
  updateSocialNetworkController
} from "../../../controllers/admin/social-networks.controller";
import {
  validateCreateSocialNetwork,
  validateReorderSocialNetworks,
  validateUpdateSocialNetwork
} from "../../../validations/admin/social-networks.validation";
import { rateLimiter } from "hono-rate-limiter";
import { getConnInfo } from "hono/bun";
import { authMiddleware, roleMiddleware } from "../../../middleware/auth.middleware";

const routes = new Hono();

const socialNetworksLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get("/", socialNetworksLimiter, getAllSocialNetworksController);
routes.get("/:id", socialNetworksLimiter, getSocialNetworkByIdController);
routes.post("/", socialNetworksLimiter, validateCreateSocialNetwork, createSocialNetworkController);
routes.patch("/:id", socialNetworksLimiter, validateUpdateSocialNetwork, updateSocialNetworkController);
routes.delete("/:id", socialNetworksLimiter, deleteSocialNetworkController);
routes.post("/reorder", socialNetworksLimiter, validateReorderSocialNetworks, reorderSocialNetworksController);

export default routes;

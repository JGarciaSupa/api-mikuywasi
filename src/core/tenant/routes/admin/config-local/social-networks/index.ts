import { Hono } from "hono";
import {
  createSocialNetworkController,
  deleteSocialNetworkController,
  getAllSocialNetworksController,
  getSocialNetworkByIdController,
  reorderSocialNetworksController,
  updateSocialNetworkController
} from "../../../../controllers/admin/config-local/social-networks.controller";
import {
  validateCreateSocialNetwork,
  validateReorderSocialNetworks,
  validateUpdateSocialNetwork
} from "../../../../validations/admin/config-local/social-networks.validation";
import { authMiddleware, roleMiddleware } from "../../../../middleware/auth.middleware";

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get("/", getAllSocialNetworksController);
routes.get("/:id", getSocialNetworkByIdController);
routes.post("/", validateCreateSocialNetwork, createSocialNetworkController);
routes.patch("/:id", validateUpdateSocialNetwork, updateSocialNetworkController);
routes.delete("/:id", deleteSocialNetworkController);
routes.post("/reorder", validateReorderSocialNetworks, reorderSocialNetworksController);

export default routes;

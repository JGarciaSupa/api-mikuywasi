import { Hono } from "hono";
import { authMiddleware, roleMiddleware } from "../../../middleware/auth.middleware";
import { validateUpdateSettings } from "../../../validations/admin/settings.validation";
import {
  getSettingsController,
  updateSettingsController,
  updateLogoController
} from "../../../controllers/admin/settings.controller";

const routes = new Hono();

routes.use('/*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', getSettingsController);
routes.patch('/', validateUpdateSettings, updateSettingsController);
routes.post('/logo', updateLogoController);

export default routes;

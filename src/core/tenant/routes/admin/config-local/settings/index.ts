import { Hono } from "hono";
import { authMiddleware } from "../../../../middleware/auth.middleware";
import {
  getSettingsController,
  updatePublicInfoController,
  updateOperationController,
  updateLocationController,
  updateAdminController,
  updateLogoController,
  deleteLogoController
} from "../../../../controllers/admin/config-local/settings.controller";
import {
  validateUpdatePublicInfo,
  validateUpdateOperation,
  validateUpdateLocation,
  validateUpdateAdmin
} from "../../../../validations/admin/config-local/settings.validation";
const routes = new Hono();

routes.use('/*', authMiddleware);

routes.get('/', getSettingsController);
routes.patch('/info', validateUpdatePublicInfo, updatePublicInfoController);
routes.patch('/operation', validateUpdateOperation, updateOperationController);
routes.patch('/location', validateUpdateLocation, updateLocationController);
routes.patch('/admin', validateUpdateAdmin, updateAdminController);
routes.post('/logo', updateLogoController);
routes.delete('/logo', deleteLogoController);

export default routes;

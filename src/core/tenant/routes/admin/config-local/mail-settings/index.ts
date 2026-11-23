import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import {
  validateSaveMailSettings,
  validateTestMail,
} from '../../../../validations/admin/config-local/mail-settings.validation';
import {
  getMailSettingsController,
  saveMailSettingsController,
  testMailController,
} from '../../../../controllers/admin/config-local/mail-settings.controller';

const routes = new Hono();

// Correo de envío del restaurante: solo quien tiene administracion.correo_envio
const canManageMail = requirePermission('administracion', 'administracion.correo_envio');

routes.use('*', authMiddleware);

routes.get('/', canManageMail, getMailSettingsController);
routes.put('/', canManageMail, validateSaveMailSettings, saveMailSettingsController);
routes.post('/test', canManageMail, validateTestMail, testMailController);

export default routes;

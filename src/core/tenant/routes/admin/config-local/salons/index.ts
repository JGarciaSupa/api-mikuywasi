import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import {
  validateCreateSalon,
  validateUpdateSalon
} from '../../../../validations/admin/config-local/salons.validation';

import {
  createSalonController,
  deleteSalonController,
  getAllSalonsController,
  updateSalonController
} from '../../../../controllers/admin/config-local/salons.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

// Los salones son parte de la gestión de mesas — reutilizan sus permisos.
routes.get('/', requirePermission('menu', 'menu.ver_mesas'), getAllSalonsController);
routes.post('/', requirePermission('menu', 'menu.gestionar_mesas'), validateCreateSalon, createSalonController);
routes.patch('/:id', requirePermission('menu', 'menu.gestionar_mesas'), validateUpdateSalon, updateSalonController);
routes.delete('/:id', requirePermission('menu', 'menu.gestionar_mesas'), deleteSalonController);

export default routes;

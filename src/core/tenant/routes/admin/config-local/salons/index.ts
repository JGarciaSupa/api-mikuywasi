import { Hono, type Context, type Next } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import { hasPermission } from '@/utils/permissions';
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

// Ver salones: quien gestiona mesas o el mozo (pestañas de salón al elegir mesa en el POS)
const canViewSalons = async (c: Context, next: Next) => {
  if (hasPermission(c, 'menu.ver_mesas') || hasPermission(c, 'mozo.ver_mesas')) return next();
  return c.json({ status: false, message: 'No tienes permisos para realizar esta acción' }, 403);
};

routes.use('*', authMiddleware);

// Los salones son parte de la gestión de mesas — reutilizan sus permisos.
routes.get('/', canViewSalons, getAllSalonsController);
routes.post('/', requirePermission('menu', 'menu.gestionar_mesas'), validateCreateSalon, createSalonController);
routes.patch('/:id', requirePermission('menu', 'menu.gestionar_mesas'), validateUpdateSalon, updateSalonController);
routes.delete('/:id', requirePermission('menu', 'menu.gestionar_mesas'), deleteSalonController);

export default routes;

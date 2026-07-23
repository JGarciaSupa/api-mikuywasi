import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  listActivationsController,
  setActivationController,
  resolveActivationsController,
} from '../../../../controllers/admin/config-local/activation.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

// Mapa efectivo para el POS — antes de '/' para no chocar con nada.
routes.get('/effective', resolveActivationsController);
routes.get('/', listActivationsController);
routes.put('/', setActivationController);

export default routes;

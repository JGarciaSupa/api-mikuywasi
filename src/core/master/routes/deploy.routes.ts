import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { getDeployOverviewController, retryDeployController } from '../controllers/deploy-admin.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

// Estado del despliegue (pasos, tareas) y reintento de los pasos conocidos
router.get('/', getDeployOverviewController);
router.post('/retry', retryDeployController);

export default router;

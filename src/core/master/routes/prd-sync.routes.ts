import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateRefreshFromPrd, validateCloneFromPrd } from '../validations/prd-sync.validation';
import {
  getPrdSyncStatusController,
  getPrdSyncJobController,
  getPrdTenantsController,
  refreshFromPrdController,
  cloneFromPrdController,
} from '../controllers/prd-sync.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

// Solo QAS (PRD_SYNC_ENABLED=true): fuera de QAS, /status responde enabled=false y el resto falla con 400
router.get('/status', getPrdSyncStatusController);
router.get('/jobs/:jobId', getPrdSyncJobController);
router.get('/tenants', getPrdTenantsController);
router.post('/tenants/:slug/update', validateRefreshFromPrd, refreshFromPrdController);
router.post('/tenants/:slug/clone', validateCloneFromPrd, cloneFromPrdController);

export default router;

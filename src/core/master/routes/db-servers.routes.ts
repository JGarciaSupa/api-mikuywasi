import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateCreateDbServer, validateUpdateDbServer } from '../validations/db-servers.validation';
import {
  getAllDbServersController,
  getDbServerByIdController,
  createDbServerController,
  updateDbServerController,
  deleteDbServerController,
} from '../controllers/db-servers.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllDbServersController);
router.post('/', validateCreateDbServer, createDbServerController);
router.get('/:id', getDbServerByIdController);
router.patch('/:id', validateUpdateDbServer, updateDbServerController);
router.delete('/:id', deleteDbServerController);

export default router;

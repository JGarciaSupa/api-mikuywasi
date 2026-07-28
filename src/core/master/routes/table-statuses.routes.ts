import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import { validateCreateTableStatus, validateUpdateTableStatus } from '../validations/table-statuses.validation';
import {
  getAllTableStatusesController,
  getTableStatusByCodeController,
  createTableStatusController,
  updateTableStatusController,
  deleteTableStatusController,
} from '../controllers/table-statuses.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllTableStatusesController);
router.post('/', validateCreateTableStatus, createTableStatusController);
router.get('/:code', getTableStatusByCodeController);
router.patch('/:code', validateUpdateTableStatus, updateTableStatusController);
router.delete('/:code', deleteTableStatusController);

export default router;

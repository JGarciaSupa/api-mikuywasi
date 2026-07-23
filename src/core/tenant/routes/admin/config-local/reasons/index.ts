import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreateReason,
  validateUpdateReason
} from '../../../../validations/admin/config-local/reason.validation';
import {
  listReasonsController,
  getReasonByIdController,
  createReasonController,
  updateReasonController,
  deleteReasonController,
} from '../../../../controllers/admin/config-local/reason.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', listReasonsController);
routes.get('/:id', getReasonByIdController);
routes.post('/', validateCreateReason, createReasonController);
routes.patch('/:id', validateUpdateReason, updateReasonController);
routes.delete('/:id', deleteReasonController);

export default routes;

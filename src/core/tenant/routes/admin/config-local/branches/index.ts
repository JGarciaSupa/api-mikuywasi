import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreateBranch,
  validateUpdateBranch,
} from '../../../../validations/admin/config-local/branches.validation';

import {
  getAllBranchesController,
  getBranchByIdController,
  createBranchController,
  updateBranchController,
  deleteBranchController,
  getMyBranchesController,
} from '../../../../controllers/admin/config-local/branches.controller';

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', getAllBranchesController);
routes.get('/mine', getMyBranchesController);
routes.get('/:id', getBranchByIdController);
routes.post('/', validateCreateBranch, createBranchController);
routes.patch('/:id', validateUpdateBranch, updateBranchController);
routes.delete('/:id', deleteBranchController);

export default routes;

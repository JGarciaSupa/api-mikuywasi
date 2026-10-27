import { Hono, type Context, type Next } from 'hono';
import { authMiddleware, requirePermission } from '../../../../middleware/auth.middleware';
import { hasPermission } from '@/utils/permissions';
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
import {
  getBranchEmpresaController,
  upsertBranchEmpresaController,
  deleteBranchEmpresaController,
  reuseBranchEmpresaController,
} from '../../../../controllers/admin/facturacion/empresa.controller';

const routes = new Hono();

// Las lecturas las usan el selector de sucursal, el POS y la caja: quedan abiertas.
const canManageBranches = requirePermission('administracion', 'administracion.gestionar_sucursales');

// Editar la sucursal y su empresa SUNAT se hace desde Parámetros o desde el detalle de sucursal
const canEditBranch = async (c: Context, next: Next) => {
  if (hasPermission(c, 'administracion.parametros') || hasPermission(c, 'administracion.gestionar_sucursales')) return next();
  return c.json({ success: false, message: 'No tienes permisos para realizar esta acción' }, 403);
};

routes.use('*', authMiddleware);

routes.get('/', getAllBranchesController);
routes.get('/mine', getMyBranchesController);
routes.get('/:id', getBranchByIdController);
routes.post('/', canManageBranches, validateCreateBranch, createBranchController);
routes.patch('/:id', canEditBranch, validateUpdateBranch, updateBranchController);
routes.delete('/:id', canManageBranches, deleteBranchController);

// Facturación electrónica — empresa propia por sucursal (Caso B)
routes.get('/:id/facturacion', getBranchEmpresaController);
routes.post('/:id/facturacion', canEditBranch, upsertBranchEmpresaController);
routes.post('/:id/facturacion/reuse', canEditBranch, reuseBranchEmpresaController);
routes.delete('/:id/facturacion', canEditBranch, deleteBranchEmpresaController);

export default routes;

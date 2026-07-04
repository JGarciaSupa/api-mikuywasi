import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import {
  validateCreateTenant,
  validateUpdateTenant,
  validateRenewSubscription,
} from '../validations/tenants.validation';
import {
  validateCreateTenantUser,
  validateUpdateTenantUser,
  validateUpdateTenantUserPassword,
} from '../validations/tenant-users.validation';
import {
  validateCreateTenantBrand,
  validateUpdateTenantBrand,
  validateCreateTenantBranch,
  validateUpdateTenantBranch,
} from '../validations/tenant-structure.validation';
import {
  getTenantStructureController,
  createTenantBrandController,
  updateTenantBrandController,
  deleteTenantBrandController,
  createTenantBranchController,
  updateTenantBranchController,
  deleteTenantBranchController,
} from '../controllers/tenant-structure.controller';
import {
  getAllTenantsController,
  getTenantByIdController,
  getTenantBySlugController,
  createTenantController,
  updateTenantController,
  renewSubscriptionController,
  deleteTenantController,
  getTenantUsersController,
  createTenantUserController,
  updateTenantUserController,
  updateTenantUserPasswordController,
  deleteTenantUserController,
} from '../controllers/tenants.controller';

const router = new Hono();

router.use('*', masterAuthMiddleware);

router.get('/', getAllTenantsController);
router.post('/', validateCreateTenant, createTenantController);
router.get('/slug/:slug', getTenantBySlugController);
router.get('/:id', getTenantByIdController);
router.patch('/:id', validateUpdateTenant, updateTenantController);
router.post('/:id/renew', validateRenewSubscription, renewSubscriptionController);
router.delete('/:id', deleteTenantController);

// GESTION DE USUARIOS
router.get('/:id/users', getTenantUsersController);
router.post('/:id/users', validateCreateTenantUser, createTenantUserController);
router.patch('/:id/users/:userId', validateUpdateTenantUser, updateTenantUserController);
router.patch('/:id/users/:userId/password', validateUpdateTenantUserPassword, updateTenantUserPasswordController);
router.delete('/:id/users/:userId', deleteTenantUserController);

// ESTRUCTURA: MARCAS Y SUCURSALES (Corporación → Marca → Sucursal)
router.get('/:id/structure', getTenantStructureController);
router.post('/:id/brands', validateCreateTenantBrand, createTenantBrandController);
router.patch('/:id/brands/:brandId', validateUpdateTenantBrand, updateTenantBrandController);
router.delete('/:id/brands/:brandId', deleteTenantBrandController);
router.post('/:id/branches', validateCreateTenantBranch, createTenantBranchController);
router.patch('/:id/branches/:branchId', validateUpdateTenantBranch, updateTenantBranchController);
router.delete('/:id/branches/:branchId', deleteTenantBranchController);

export default router;

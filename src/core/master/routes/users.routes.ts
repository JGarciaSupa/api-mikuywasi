import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import {
  validateCreateUser,
  validateUpdateUser,
  validateUpdatePassword,
  validateResetPassword,
  validateLogin,
} from '../validations/users.validation';
import {
  loginController,
  refreshController,
  logoutController,
  getMeController,
  getAllUsersController,
  getUserByIdController,
  createUserController,
  updateUserController,
  updatePasswordController,
  deleteUserController,
  resetUserPasswordController,
  provisionExistingTenantsController,
} from '../controllers/users.controller';

const router = new Hono();

// ── Rutas públicas ─────────────────────────────────────────────────────────────
router.post('/login', validateLogin, loginController);
router.post('/refresh', refreshController);
router.post('/logout', logoutController);

// ── Rutas protegidas ──────────────────────────────────────────────────────────
router.use('*', masterAuthMiddleware);

router.get('/profile', getMeController);
router.patch('/profile/password', validateUpdatePassword, updatePasswordController);

router.get('/', getAllUsersController);
router.post('/', validateCreateUser, createUserController);
router.get('/:id', getUserByIdController);
router.patch('/:id', validateUpdateUser, updateUserController);
router.patch('/:id/password', validateResetPassword, resetUserPasswordController);
router.post('/:id/provision-existing', provisionExistingTenantsController);
router.delete('/:id', deleteUserController);

export default router;

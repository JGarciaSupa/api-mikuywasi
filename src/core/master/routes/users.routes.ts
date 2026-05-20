import { Hono } from 'hono';
import { masterAuthMiddleware } from '../middleware/auth.middleware';
import {
  validateCreateUser,
  validateUpdateUser,
  validateUpdatePassword,
  validateLogin,
} from '../validations/users.validation';
import {
  loginController,
  getMeController,
  getAllUsersController,
  getUserByIdController,
  createUserController,
  updateUserController,
  updatePasswordController,
  deleteUserController,
} from '../controllers/users.controller';

const router = new Hono();

// ── Rutas públicas ─────────────────────────────────────────────────────────────
router.post('/login', validateLogin, loginController);

// ── Rutas protegidas ──────────────────────────────────────────────────────────
router.use('*', masterAuthMiddleware);

router.get('/profile', getMeController);
router.patch('/profile/password', validateUpdatePassword, updatePasswordController);

router.get('/', getAllUsersController);
router.post('/', validateCreateUser, createUserController);
router.get('/:id', getUserByIdController);
router.patch('/:id', validateUpdateUser, updateUserController);
router.delete('/:id', deleteUserController);

export default router;

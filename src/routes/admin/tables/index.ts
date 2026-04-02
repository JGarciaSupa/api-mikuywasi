import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { 
  validateCreateTable, 
  validateUpdateTable 
} from '../../../validations/admin/tables.validation';
import { 
  createTableController, 
  deleteTableController, 
  getAllTablesController, 
  updateTableController 
} from '../../../controllers/admin/tables.controller';
import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from 'hono/bun';

const routes = new Hono();

const tablesLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => getConnInfo(c).remote.address || 'anonymous',
  message: {
    success: false,
    message: 'Demasiados intentos, intente de nuevo en 1 minuto'
  }
});

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

routes.get('/', tablesLimiter, getAllTablesController);
routes.post('/', tablesLimiter, validateCreateTable, createTableController);
routes.patch('/:id', tablesLimiter, validateUpdateTable, updateTableController);
routes.delete('/:id', tablesLimiter, deleteTableController);

export default routes;

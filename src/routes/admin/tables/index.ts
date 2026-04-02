import { Hono } from 'hono';
import { authMiddleware } from '../../../middleware/auth.middleware';
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

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', getAllTablesController);
routes.post('/', validateCreateTable, createTableController);
routes.patch('/:id', validateUpdateTable, updateTableController);
routes.delete('/:id', deleteTableController);

export default routes;

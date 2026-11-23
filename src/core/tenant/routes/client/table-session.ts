import { Hono } from 'hono';
import {
  createCallController,
  joinTableController,
  lookupTableController,
  qrMenuController,
  sessionStateController,
  submitRoundController,
} from '../../controllers/client/table-session.controller';
const routes = new Hono();

routes.get('/lookup', lookupTableController);
routes.get('/menu', qrMenuController);
routes.post('/join', joinTableController);
routes.get('/state', sessionStateController);
routes.post('/rounds', submitRoundController);
routes.post('/calls', createCallController);

export default routes;

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as ActivationsController from '../controllers/activations.controller';
import { createActivationSchema, updateActivationSchema } from '../validations/activations.validation';
import { masterAuthMiddleware } from '../middleware/auth.middleware';

const activationsRoutes = new Hono();

activationsRoutes.use('*', masterAuthMiddleware);

activationsRoutes.get('/', ActivationsController.getActivations);
activationsRoutes.get('/:id', ActivationsController.getActivationById);
activationsRoutes.post('/', zValidator('json', createActivationSchema), ActivationsController.createActivation);
activationsRoutes.patch('/:id', zValidator('json', updateActivationSchema), ActivationsController.updateActivation);
activationsRoutes.delete('/:id', ActivationsController.deleteActivation);

export default activationsRoutes;

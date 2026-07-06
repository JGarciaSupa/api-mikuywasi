import { Hono } from 'hono';
import { authMiddleware } from '../../../../middleware/auth.middleware';
import {
  validateCreateSalesChannel,
  validateUpdateSalesChannel
} from '../../../../validations/admin/config-local/sales-channel.validation';
import {
  createSalesChannelController,
  deleteSalesChannelController,
  getAllSalesChannelsController,
  getSalesChannelByIdController,
  updateSalesChannelController
} from '../../../../controllers/admin/config-local/sales-channel.controller';

const routes = new Hono();

routes.use('*', authMiddleware);

routes.get('/', getAllSalesChannelsController);
routes.get('/:id', getSalesChannelByIdController);
routes.post('/', validateCreateSalesChannel, createSalesChannelController);
routes.patch('/:id', validateUpdateSalesChannel, updateSalesChannelController);
routes.delete('/:id', deleteSalesChannelController);

export default routes;

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as IdentityDocumentTypesController from '../controllers/identity-document-types.controller';
import { createIdentityDocumentTypeSchema, updateIdentityDocumentTypeSchema } from '../validations/identity-document-types.validation';
import { masterAuthMiddleware } from '../middleware/auth.middleware';

const identityDocumentTypesRoutes = new Hono();

identityDocumentTypesRoutes.use('*', masterAuthMiddleware);

identityDocumentTypesRoutes.get('/', IdentityDocumentTypesController.getIdentityDocumentTypes);
identityDocumentTypesRoutes.get('/:id', IdentityDocumentTypesController.getIdentityDocumentTypeById);
identityDocumentTypesRoutes.post('/', zValidator('json', createIdentityDocumentTypeSchema), IdentityDocumentTypesController.createIdentityDocumentType);
identityDocumentTypesRoutes.patch('/:id', zValidator('json', updateIdentityDocumentTypeSchema), IdentityDocumentTypesController.updateIdentityDocumentType);
identityDocumentTypesRoutes.delete('/:id', IdentityDocumentTypesController.deleteIdentityDocumentType);

export default identityDocumentTypesRoutes;

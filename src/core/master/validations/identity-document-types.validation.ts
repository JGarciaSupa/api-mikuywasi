import { z } from 'zod';

export const createIdentityDocumentTypeSchema = z.object({
  countryId: z.number().int().positive('El país es obligatorio'),
  code: z.string().min(1, 'El código es obligatorio').max(50, 'El código es muy largo'),
  name: z.string().min(1, 'El nombre es obligatorio').max(100, 'El nombre es muy largo'),
  description: z.string().max(255).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const updateIdentityDocumentTypeSchema = createIdentityDocumentTypeSchema.partial();

export type CreateIdentityDocumentTypeInput = z.infer<typeof createIdentityDocumentTypeSchema>;
export type UpdateIdentityDocumentTypeInput = z.infer<typeof updateIdentityDocumentTypeSchema>;

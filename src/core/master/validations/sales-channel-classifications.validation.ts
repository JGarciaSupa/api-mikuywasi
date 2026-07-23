import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createSalesChannelClassificationSchema = z.object({
  code: z.string().min(1, 'El código es requerido').max(50),
  group: z.string().min(1, 'El grupo es requerido').max(50),
  name: z.string().min(1, 'El nombre es requerido').max(100),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateSalesChannelClassificationSchema = z.object({
  group: z.string().min(1, 'El grupo es requerido').max(50).optional(),
  name: z.string().min(1, 'El nombre es requerido').max(100).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export type CreateSalesChannelClassificationInput = z.infer<typeof createSalesChannelClassificationSchema>;
export type UpdateSalesChannelClassificationInput = z.infer<typeof updateSalesChannelClassificationSchema>;

export const validateCreateSalesChannelClassification = zValidator('json', createSalesChannelClassificationSchema);
export const validateUpdateSalesChannelClassification = zValidator('json', updateSalesChannelClassificationSchema);

import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createSalesChannelSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  code: z.string().min(1, 'El código es requerido').max(30, 'El código no puede exceder los 30 caracteres'),
  type: z.enum(['dine_in', 'delivery', 'pickup']),
  isActive: z.boolean().default(true),
});

export const updateSalesChannelSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres').optional(),
  code: z.string().min(1, 'El código es requerido').max(30, 'El código no puede exceder los 30 caracteres').optional(),
  type: z.enum(['dine_in', 'delivery', 'pickup']).optional(),
  isActive: z.boolean().optional(),
});

export type CreateSalesChannelInput = z.infer<typeof createSalesChannelSchema>;
export type UpdateSalesChannelInput = z.infer<typeof updateSalesChannelSchema>;

export const validateCreateSalesChannel = zValidator('json', createSalesChannelSchema);
export const validateUpdateSalesChannel = zValidator('json', updateSalesChannelSchema);

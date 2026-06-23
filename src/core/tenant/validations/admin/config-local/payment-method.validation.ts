import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createPaymentMethodSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  isActive: z.boolean().default(true),
  retentionPercentage: z.number().min(0, 'La retención no puede ser negativa').max(100, 'La retención no puede exceder 100%').default(0),
  branchId: z.number().optional(),
});

export const updatePaymentMethodSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres').optional(),
  isActive: z.boolean().optional(),
  retentionPercentage: z.number().min(0, 'La retención no puede ser negativa').max(100, 'La retención no puede exceder 100%').optional(),
});

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;
export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;

export const validateCreatePaymentMethod = zValidator('json', createPaymentMethodSchema);
export const validateUpdatePaymentMethod = zValidator('json', updatePaymentMethodSchema);

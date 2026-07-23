import { z } from 'zod';

export const createActivationSchema = z.object({
  code: z.string().min(1, 'El código es obligatorio').max(80, 'El código es muy largo'),
  name: z.string().min(1, 'El nombre es obligatorio').max(120, 'El nombre es muy largo'),
  description: z.string().max(255).optional().nullable(),
  module: z.string().min(1).max(50).optional().default('caja_chica'),
  category: z.string().min(1).max(50).optional().default('general'),
  defaultEnabled: z.boolean().optional().default(false),
  order: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateActivationSchema = createActivationSchema.partial();

export type CreateActivationInput = z.infer<typeof createActivationSchema>;
export type UpdateActivationInput = z.infer<typeof updateActivationSchema>;

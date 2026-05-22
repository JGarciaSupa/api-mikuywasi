import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../../validations/hook';

export const createPlanSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  monthlyPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio mensual inválido'),
  yearlyPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio anual inválido'),
  features: z.record(z.string(), z.any()).optional().default({}),
  visible: z.boolean().default(false),
});

export const updatePlanSchema = createPlanSchema.partial();

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const validateCreatePlan = zValidator('json', createPlanSchema, validationHook);
export const validateUpdatePlan = zValidator('json', updatePlanSchema, validationHook);

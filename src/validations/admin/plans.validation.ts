import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createPlanSchema = z.object({
  name: z.string({ error: 'El nombre es requerido' }).min(1, 'El nombre es requerido'),
  monthlyPrice: z.string({ error: 'El precio mensual es requerido' }).regex(/^\d+(\.\d{1,2})?$/, 'Precio mensual inválido'),
  yearlyPrice: z.string({ error: 'El precio anual es requerido' }).regex(/^\d+(\.\d{1,2})?$/, 'Precio anual inválido'),
  features: z.array(z.string({ error: 'Las características son requeridas' })).optional().default([]),
  order: z.number({ error: 'El orden es requerido' }).int().optional().default(0),
  visible: z.boolean({ error: 'La visibilidad es requerida' }).optional().default(true),
});

export const updatePlanSchema = createPlanSchema.partial();

export const reorderPlansSchema = z.object({
  plans: z.array(z.object({
    id: z.number({ error: 'El ID es requerido' }).int(),
    order: z.number({ error: 'El orden es requerido' }).int()
  }))
});

export const validateCreatePlan = zValidator('json', createPlanSchema);
export const validateUpdatePlan = zValidator('json', updatePlanSchema);
export const validateReorderPlans = zValidator('json', reorderPlansSchema);

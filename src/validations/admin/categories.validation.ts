import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createCategorySchema = z.object({
  tenantId: z.number({ error: 'El ID del tenant es requerido' }).int(),
  name: z.string({ error: 'El nombre es requerido' }).min(1, 'El nombre es requerido').max(50, 'El nombre no puede exceder los 50 caracteres'),
  order: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, 'Formato de hora de inicio inválido (HH:mm o HH:mm:ss)').optional().nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, 'Formato de hora de fin inválido (HH:mm o HH:mm:ss)').optional().nullable(),
  availableDays: z.array(z.number().min(0).max(6)).optional().default([0, 1, 2, 3, 4, 5, 6]),
});

export const updateCategorySchema = createCategorySchema.partial();

export const reorderCategoriesSchema = z.object({
  categories: z.array(z.object({
    id: z.number({ error: 'El ID es requerido' }).int(),
    order: z.number({ error: 'El orden es requerido' }).int()
  }))
});

export const validateCreateCategory = zValidator('json', createCategorySchema);
export const validateUpdateCategory = zValidator('json', updateCategorySchema);
export const validateReorderCategories = zValidator('json', reorderCategoriesSchema);

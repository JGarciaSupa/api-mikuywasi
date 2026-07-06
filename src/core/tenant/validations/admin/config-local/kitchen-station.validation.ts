import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createKitchenStationSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  code: z.string().min(1, 'El código es requerido').max(30, 'El código no puede exceder los 30 caracteres'),
  isActive: z.boolean().default(true),
});

export const updateKitchenStationSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres').optional(),
  code: z.string().min(1, 'El código es requerido').max(30, 'El código no puede exceder los 30 caracteres').optional(),
  isActive: z.boolean().optional(),
});

export type CreateKitchenStationInput = z.infer<typeof createKitchenStationSchema>;
export type UpdateKitchenStationInput = z.infer<typeof updateKitchenStationSchema>;

export const validateCreateKitchenStation = zValidator('json', createKitchenStationSchema);
export const validateUpdateKitchenStation = zValidator('json', updateKitchenStationSchema);

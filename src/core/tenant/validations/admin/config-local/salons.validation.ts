import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createSalonSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  branchId: z.number({ error: 'La sucursal es requerida' }).int().positive('La sucursal es requerida'),
});

export const updateSalonSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
});

export type CreateSalonInput = z.infer<typeof createSalonSchema>;
export type UpdateSalonInput = z.infer<typeof updateSalonSchema>;

export const validateCreateSalon = zValidator('json', createSalonSchema);
export const validateUpdateSalon = zValidator('json', updateSalonSchema);

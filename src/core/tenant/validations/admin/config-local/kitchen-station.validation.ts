import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../hook';

export const createKitchenStationSchema = z.object({
  branchId: z.coerce.number().int().positive('La sucursal es requerida'),
  printerId: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  code: z.string().min(1, 'El código es requerido').max(30, 'Máximo 30 caracteres')
    .regex(/^[A-Z0-9_-]+$/, 'El código solo puede contener letras mayúsculas, números, guiones y guiones bajos'),
  isActive: z.boolean().optional().default(true),
});

export const updateKitchenStationSchema = createKitchenStationSchema.partial();

export const validateCreateKitchenStation = zValidator('json', createKitchenStationSchema, validationHook);
export const validateUpdateKitchenStation = zValidator('json', updateKitchenStationSchema, validationHook);

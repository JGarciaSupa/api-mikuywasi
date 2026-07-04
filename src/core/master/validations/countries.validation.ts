import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '@/core/tenant/validations/hook';

export const createCountrySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  isoCode: z.string().min(2, 'Código ISO inválido').max(3).toUpperCase(),
  isActive: z.boolean().default(true),
});

export const updateCountrySchema = createCountrySchema.partial();

export type CreateCountryInput = z.infer<typeof createCountrySchema>;
export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;

export const validateCreateCountry = zValidator('json', createCountrySchema, validationHook);
export const validateUpdateCountry = zValidator('json', updateCountrySchema, validationHook);

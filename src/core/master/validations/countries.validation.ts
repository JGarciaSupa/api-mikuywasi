import { z } from 'zod';

export const createCountrySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  isoCode: z.string().length(3, 'El código ISO debe tener 3 caracteres').toUpperCase(),
  dialCode: z.string().min(1, 'El prefijo telefónico es obligatorio').regex(/^\+\d+/, 'Debe empezar con + seguido de números'),
  isActive: z.boolean().optional().default(false),
});

export const updateCountrySchema = createCountrySchema.partial();

export type CreateCountryInput = z.infer<typeof createCountrySchema>;
export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;

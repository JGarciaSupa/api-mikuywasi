import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '@/core/tenant/validations/hook';

export const createCurrencySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  isoCode: z.string().length(3, 'El código ISO 4217 debe tener 3 letras').toUpperCase(),
  symbol: z.string().min(1, 'El símbolo es obligatorio').max(5),
  isActive: z.boolean().default(true),
});

export const updateCurrencySchema = createCurrencySchema.partial();

export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;
export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;

export const validateCreateCurrency = zValidator('json', createCurrencySchema, validationHook);
export const validateUpdateCurrency = zValidator('json', updateCurrencySchema, validationHook);

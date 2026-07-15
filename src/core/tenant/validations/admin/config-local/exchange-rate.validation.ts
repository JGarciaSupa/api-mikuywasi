import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createExchangeRateSchema = z.object({
  dateExchangeRate: z.string().min(10, { message: 'Fecha inválida' }),
  currencyFrom: z.string().min(1, 'Moneda de origen requerida').max(3, 'Máximo 3 caracteres'),
  currencyTo: z.string().min(1, 'Moneda de destino requerida').max(3, 'Máximo 3 caracteres'),
  buyExchangeRate: z.number().min(0).optional(),
  sellExchangeRate: z.number().min(0).optional(),
  hotelExchangeRate: z.number().min(0).optional(),
  officialExchangeRate: z.number().min(0).optional(),
  branchId: z.number().optional(),
  userId: z.number().optional(),
});

export const updateExchangeRateSchema = createExchangeRateSchema.partial();

export type CreateExchangeRateInput = z.infer<typeof createExchangeRateSchema>;
export type UpdateExchangeRateInput = z.infer<typeof updateExchangeRateSchema>;

export const validateCreateExchangeRate = zValidator('json', createExchangeRateSchema);
export const validateUpdateExchangeRate = zValidator('json', updateExchangeRateSchema);

import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const applyDiscountSchema = z.object({
  reasonId: z.number().int().positive('Selecciona un motivo de descuento'),
  // Solo para motivos en modo manual
  manualAmount: z.number().positive('El importe del descuento debe ser mayor a 0').max(9_999_999).optional(),
});

export type ApplyDiscountBody = z.infer<typeof applyDiscountSchema>;

export const validateApplyDiscount = zValidator('json', applyDiscountSchema, (result, c) => {
  if (!result.success) {
    return c.json({ success: false, message: result.error.issues[0]?.message ?? 'Datos de descuento inválidos' }, 400);
  }
});

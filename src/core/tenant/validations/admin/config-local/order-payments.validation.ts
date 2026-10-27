import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const paymentLineSchema = z.object({
  paymentMethodId: z.number().int().positive('Método de pago inválido'),
  amount: z.number()
    .positive('Cada importe debe ser mayor a 0')
    .max(9_999_999, 'Importe demasiado alto')
    .refine((v) => Math.round(v * 100) === v * 100 || Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'Máximo 2 decimales por importe'),
  reference: z.string().trim().max(50, 'La referencia admite máximo 50 caracteres').optional(),
});

export const multiPaymentSchema = z.object({
  payments: z.array(paymentLineSchema)
    .min(2, 'El pago mixto requiere al menos dos métodos de pago')
    .max(10, 'Máximo 10 métodos de pago por cobro'),
});

export type MultiPaymentInput = z.infer<typeof multiPaymentSchema>;

export const validateMultiPayment = zValidator('json', multiPaymentSchema, (result, c) => {
  if (!result.success) {
    return c.json({ success: false, message: result.error.issues[0]?.message ?? 'Datos de pago inválidos' }, 400);
  }
});

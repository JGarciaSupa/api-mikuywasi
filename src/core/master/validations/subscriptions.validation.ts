import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '@/core/tenant/validations/hook';

export const createSubscriptionSchema = z.object({
  tenantId: z.coerce.number().int().positive('El tenant es obligatorio'),
  planId: z.coerce.number().int().positive('El plan es obligatorio'),
  billingCycle: z.enum(['monthly', 'yearly']),
  pricePaid: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio inválido'),
  startDate: z.string().datetime('Fecha de inicio inválida'),
  endDate: z.string().datetime('Fecha de fin inválida'),
  status: z.enum(['active', 'expired', 'canceled', 'pending_payment']).default('active'),
  paymentStatus: z.enum(['paid', 'pending', 'failed']).default('paid'),
  notes: z.string().optional().nullable(),
  gatewayName: z.string().max(50).optional().nullable(),
  gatewayInvoiceId: z.string().max(255).optional().nullable(),
});

export const updateSubscriptionSchema = z.object({
  status: z.enum(['active', 'expired', 'canceled', 'pending_payment']).optional(),
  paymentStatus: z.enum(['paid', 'pending', 'failed']).optional(),
  notes: z.string().optional().nullable(),
  gatewayName: z.string().max(50).optional().nullable(),
  gatewayInvoiceId: z.string().max(255).optional().nullable(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const validateCreateSubscription = zValidator('json', createSubscriptionSchema, validationHook);
export const validateUpdateSubscription = zValidator('json', updateSubscriptionSchema, validationHook);

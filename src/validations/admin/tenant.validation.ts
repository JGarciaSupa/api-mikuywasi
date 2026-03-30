import { z } from 'zod';

import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../hook';

export const createTenantSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  slug: z.string().min(1, 'El slug es obligatorio').max(255).regex(/^[a-z0-9-]+$/, 'El solo minúsculas, números y guiones'),
  planId: z.coerce.number().int().positive('El plan es obligatorio'),
  billingCycle: z.enum(['monthly', 'yearly']),
  planEndsAt: z.string().datetime().optional().nullable(),
  email: z.string().email('Email inválido').optional().nullable(),
  phone: z.string().max(255).optional().nullable(),
  whatsapp: z.string().max(255).optional().nullable(),
  category: z.string().max(255).optional().nullable(),
  ownerName: z.string().max(255).optional().nullable(),
  ownerPhone: z.string().max(255).optional().nullable(),
  fiscalId: z.string().max(255).optional().nullable(),
  fiscalName: z.string().max(255).optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateTenantSchema = createTenantSchema.partial().extend({
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
});

export const renewSubscriptionSchema = z.object({
  planId: z.coerce.number().int().positive().optional(),
  billingCycle: z.enum(['monthly', 'yearly']).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  pricePaid: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio inválido').optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type RenewSubscriptionInput = z.infer<typeof renewSubscriptionSchema>;

export const validateCreateTenant = zValidator('json', createTenantSchema, validationHook);
export const validateUpdateTenant = zValidator('json', updateTenantSchema, validationHook);
export const validateRenewSubscription = zValidator('json', renewSubscriptionSchema, validationHook);


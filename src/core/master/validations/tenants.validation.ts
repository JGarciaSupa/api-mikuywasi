import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../../validations/hook';

const RESERVED_SLUGS = [
  'api', 'api-docs', 'admin', 'app', 'auth', 'login', 'register', 'logout',
  'dashboard', 'settings', 'account', 'billing', 'subscriptions', 'www',
  'localhost', 'test', 'dev', 'staging', 'demo', 'status', 'uptime', 'docs',
  'help', 'support', 'mail', 'static', 'assets', 'public', 'private',
  'internal', 'proxy', 'cdn', 'media', 'images', 'webhook', 'oauth',
  'callback', 'error', 'root', 'sys', 'system', 'config', 'null', 'secure',
  'ssl', 'ftp', 'smtp', 'pop', 'imap', 'about', 'contact', 'legal',
  'privacy', 'terms', 'conditions', 'jobs', 'careers', 'press', 'news',
  'blog', 'marketing', 'sales', 'shop', 'store',
];

const baseTenantSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  slug: z
    .string()
    .min(1, 'El slug es obligatorio')
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  status: z.enum(['active', 'inactive']).default('active'),
  serverId: z.coerce.number().int().positive('El servidor es obligatorio'),
  dbName: z.string().min(1, 'El nombre de base de datos es obligatorio').max(255).regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guion bajo'),
  planId: z.coerce.number().int().positive('El plan es obligatorio'),
  billingCycle: z.enum(['monthly', 'yearly']),
  planEndsAt: z.string().datetime().optional().nullable(),
  ownerName: z.string().max(255).optional().nullable(),
  ownerPhone: z.string().max(255).optional().nullable(),
  internalNotes: z.string().optional().nullable(),
});

export const createTenantSchema = baseTenantSchema.refine(
  (data) => !RESERVED_SLUGS.includes(data.slug),
  { message: 'Este slug está reservado para el sistema', path: ['slug'] }
);

export const updateTenantSchema = baseTenantSchema
  .partial()
  .extend({
    slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  })
  .refine((data) => {
    if (data.slug) return !RESERVED_SLUGS.includes(data.slug);
    return true;
  }, { message: 'Este slug está reservado para el sistema', path: ['slug'] });

export const renewSubscriptionSchema = z.object({
  planId: z.coerce.number().int().positive().optional(),
  billingCycle: z.enum(['monthly', 'yearly']).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  pricePaid: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio inválido').optional(),
  notes: z.string().optional().nullable(),
  gatewayName: z.string().max(50).optional().nullable(),
  gatewayInvoiceId: z.string().max(255).optional().nullable(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type RenewSubscriptionInput = z.infer<typeof renewSubscriptionSchema>;

export const validateCreateTenant = zValidator('json', createTenantSchema, validationHook);
export const validateUpdateTenant = zValidator('json', updateTenantSchema, validationHook);
export const validateRenewSubscription = zValidator('json', renewSubscriptionSchema, validationHook);

import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../hook';

export const updateSettingsSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255).optional(),
  category: z.string().max(255).optional().nullable(),
  phone: z.string().max(255).optional().nullable(),
  whatsapp: z.string().max(255).optional().nullable(),
  email: z.string().email('Email inválido').optional().nullable(),
  primaryColor: z.string().max(255).optional().nullable(),
  secondaryColor: z.string().max(255).optional().nullable(),
  accentColor: z.string().max(255).optional().nullable(),
  address: z.object({
    fullAddress: z.string().max(255).optional().nullable().or(z.literal("")),
    lat: z.number(),
    lng: z.number(),
  }).optional().nullable(),
  schedules: z.array(z.object({
    day: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    closed: z.boolean(),
  })).optional().nullable(),
  hasDelivery: z.boolean().optional(),
  hasPickup: z.boolean().optional(),
  hasDineIn: z.boolean().optional(),
  hasLiveTracking: z.boolean().optional(),
  minOrderAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Monto inválido').optional(),
  defaultDeliveryFee: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Monto inválido').optional(),
  freeDeliveryThreshold: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Monto inválido').optional().nullable(),
  ownerName: z.string().max(255).optional().nullable(),
  ownerPhone: z.string().max(255).optional().nullable(),
  fiscalId: z.string().max(255).optional().nullable(),
  fiscalName: z.string().max(255).optional().nullable(),
  internalNotes: z.string().optional().nullable(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const validateUpdateSettings = zValidator('json', updateSettingsSchema, validationHook);

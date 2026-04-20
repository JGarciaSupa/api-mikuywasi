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
  minOrderAmount: z.preprocess((val) => (typeof val === 'string' ? val.trim().replace(',', '.') : val), z.string().regex(/^(\d+)?(\.\d{1,2})?$/, 'Monto inválido').optional().transform(v => !v || v === "" ? "0.00" : v)),
  defaultDeliveryFee: z.preprocess((val) => (typeof val === 'string' ? val.trim().replace(',', '.') : val), z.string().regex(/^(\d+)?(\.\d{1,2})?$/, 'Monto inválido').optional().transform(v => !v || v === "" ? "0.00" : v)),
  freeDeliveryThreshold: z.preprocess((val) => (typeof val === 'string' ? val.trim().replace(',', '.') : val), z.string().regex(/^(\d+)?(\.\d{1,2})?$/, 'Monto inválido').optional().nullable().transform(v => !v || v === "" ? null : v)),
  ownerName: z.string().max(255).optional().nullable(),
  ownerPhone: z.string().max(255).optional().nullable(),
  fiscalId: z.string().max(255).optional().nullable(),
  fiscalName: z.string().max(255).optional().nullable(),
  internalNotes: z.string().optional().nullable(),
});

export const updatePublicInfoSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255).optional(),
  category: z.string().max(255).optional().nullable(),
  phone: z.string().max(255).optional().nullable(),
  whatsapp: z.string().max(255).optional().nullable(),
  email: z.string().email('Email inválido').optional().nullable(),
  primaryColor: z.string().max(255).optional().nullable(),
  secondaryColor: z.string().max(255).optional().nullable(),
  accentColor: z.string().max(255).optional().nullable(),
});

export const updateOperationSchema = z.object({
  schedules: z.array(z.object({
    day: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    closed: z.boolean(),
  })).optional(),
  hasDelivery: z.boolean().optional(),
  hasPickup: z.boolean().optional(),
  hasDineIn: z.boolean().optional(),
  minOrderAmount: z.preprocess((val) => (typeof val === 'string' ? val.trim().replace(',', '.') : val), z.string().regex(/^(\d+)?(\.\d{1,2})?$/, 'Monto inválido').optional().transform(v => !v || v === "" ? "0.00" : v)),
  defaultDeliveryFee: z.preprocess((val) => (typeof val === 'string' ? val.trim().replace(',', '.') : val), z.string().regex(/^(\d+)?(\.\d{1,2})?$/, 'Monto inválido').optional().transform(v => !v || v === "" ? "0.00" : v)),
  freeDeliveryThreshold: z.preprocess((val) => (typeof val === 'string' ? val.trim().replace(',', '.') : val), z.string().regex(/^(\d+)?(\.\d{1,2})?$/, 'Monto inválido').optional().nullable().transform(v => !v || v === "" ? null : v)),
});

export const updateLocationSchema = z.object({
  fullAddress: z.string().max(255).optional().nullable().or(z.literal("")),
  lat: z.number(),
  lng: z.number(),
});

export const updateAdminSchema = z.object({
  ownerName: z.string().max(255).optional().nullable(),
  ownerPhone: z.string().max(255).optional().nullable(),
  fiscalId: z.string().max(255).optional().nullable(),
  fiscalName: z.string().max(255).optional().nullable(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type UpdatePublicInfoInput = z.infer<typeof updatePublicInfoSchema>;
export type UpdateOperationInput = z.infer<typeof updateOperationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;

export const validateUpdateSettings = zValidator('json', updateSettingsSchema, validationHook);
export const validateUpdatePublicInfo = zValidator('json', updatePublicInfoSchema, validationHook);
export const validateUpdateOperation = zValidator('json', updateOperationSchema, validationHook);
export const validateUpdateLocation = zValidator('json', updateLocationSchema, validationHook);
export const validateUpdateAdmin = zValidator('json', updateAdminSchema, validationHook);

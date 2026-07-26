import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const scheduleSchema = z.object({
  day: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  closed: z.boolean(),
});

const addressSchema = z.object({
  fullAddress: z.string(),
  lat: z.number(),
  lng: z.number(),
}).nullable().optional();

const branchTaxSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  rate: z.coerce.number().min(0),
  defaultActive: z.preprocess((val) => val === "true" || val === true, z.boolean()).optional().default(false),
  isActive: z.preprocess((val) => val === "true" || val === true, z.boolean()).optional().default(false),
});

export const createBranchSchema = z.object({
  brandId: z.number().int().positive('El ID de marca es requerido'),
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  code: z.string().min(1, 'El código es requerido').max(20, 'El código no puede exceder los 20 caracteres'),
  countryCode: z.string().length(3, 'El código de país debe tener 3 caracteres (ISO 3166-1 alpha-3)').nullable().optional(),
  baseCurrency: z.string().length(3, 'El código de moneda debe tener 3 caracteres (ISO 4217)').nullable().optional(),
  foreignCurrency: z.string().length(3, 'El código de moneda debe tener 3 caracteres (ISO 4217)').nullable().optional(),
  isMain: z.boolean().optional(),
  isActive: z.boolean().optional(),
  allowSellWithoutStock: z.boolean().optional(),
  address: addressSchema,
  phone: z.string().max(30).nullable().optional(),
  whatsapp: z.string().max(30).nullable().optional(),
  email: z.string().max(150).nullable().optional(),
  hasDelivery: z.boolean().optional(),
  hasPickup: z.boolean().optional(),
  hasDineIn: z.boolean().optional(),
  hasLiveTracking: z.boolean().optional(),
  minOrderAmount: z.string().optional(),
  defaultDeliveryFee: z.string().optional(),
  freeDeliveryThreshold: z.string().nullable().optional(),
  fiscalId: z.string().max(30).nullable().optional(),
  fiscalName: z.string().max(200).nullable().optional(),
  taxes: z.array(branchTaxSchema).optional(),
  sunatAnexo: z.string().refine(val => val === '' || /^\d{4}$/.test(val), 'El anexo SUNAT debe tener 4 dígitos (ej. 0000, 0001)').nullable().optional(),
  schedules: z.array(scheduleSchema).optional(),
  deliveryZone: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(
      z.array(
        z.tuple([z.number(), z.number()])
      ).min(4, 'El anillo necesita al menos 4 puntos (3 únicos + cierre)')
    ).min(1, 'Se requiere al menos el anillo exterior'),
  }).nullable().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const validateCreateBranch = zValidator('json', createBranchSchema);
export const validateUpdateBranch = zValidator('json', updateBranchSchema);

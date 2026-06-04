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

export const createBranchSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  code: z.string().min(1, 'El código es requerido').max(20, 'El código no puede exceder los 20 caracteres'),
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

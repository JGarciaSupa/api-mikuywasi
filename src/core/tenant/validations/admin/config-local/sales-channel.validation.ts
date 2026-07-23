import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const classificationCodes = [
  'dine_in',
  'pickup',
  'drive_thru',
  'kiosk',
  'direct_delivery',
  'aggregator_delivery',
  'catering',
  'corporate',
  'dark_kitchen',
  'room_service',
] as const;

export const createSalesChannelSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  code: z.string().min(1, 'El código es requerido').max(30, 'El código no puede exceder los 30 caracteres'),
  classificationCode: z.enum(classificationCodes).optional(),
  isActive: z.boolean().default(true),
  isWaiterEnabled: z.boolean().default(false),
  requireTable: z.boolean().default(false),
  requireWaiter: z.boolean().default(false),
  requirePax: z.boolean().default(false),
  requireCustomer: z.boolean().default(false),
  requireDeliveryAddress: z.boolean().default(false),
});

export const updateSalesChannelSchema = createSalesChannelSchema.partial();



export type CreateSalesChannelInput = z.infer<typeof createSalesChannelSchema>;
export type UpdateSalesChannelInput = z.infer<typeof updateSalesChannelSchema>;

export const validateCreateSalesChannel = zValidator('json', createSalesChannelSchema);
export const validateUpdateSalesChannel = zValidator('json', updateSalesChannelSchema);

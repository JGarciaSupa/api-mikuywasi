import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '@/core/tenant/validations/hook';

export const createLocalSchema = z.object({
  brandId: z.number().int().positive('La marca es obligatoria'),

  // Tab 1: Datos Generales
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  address: z.string().max(500).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  countryId: z.number().int().positive('El país es obligatorio'),

  // Tab 2: Configuración Tributaria
  ruc: z.string().min(1, 'El RUC es obligatorio').max(20),
  sunatAnexoCode: z.string().max(10).optional().default('0000'),
  appliesTax1: z.boolean().default(true),
  appliesTax2: z.boolean().default(false),
  appliesTax3: z.boolean().default(false),
  appliesIcbper: z.boolean().default(false),

  // Tab 3: Finanzas
  baseCurrencyId: z.number().int().positive('La moneda base es obligatoria'),
  foreignCurrencyId: z.number().int().positive().optional().nullable(),

  isActive: z.boolean().default(true),
});

export const updateLocalSchema = createLocalSchema.omit({ brandId: true }).partial();

export type CreateLocalInput = z.infer<typeof createLocalSchema>;
export type UpdateLocalInput = z.infer<typeof updateLocalSchema>;

export const validateCreateLocal = zValidator('json', createLocalSchema, validationHook);
export const validateUpdateLocal = zValidator('json', updateLocalSchema, validationHook);

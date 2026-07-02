import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '@/core/tenant/validations/hook';

export const createBrandSchema = z.object({
  tenantId: z.number().int().positive('La corporación es obligatoria'),
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  logoUrl: z.string().url('URL de logo inválida').optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido, usa formato #RRGGBB').optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export const updateBrandSchema = createBrandSchema.omit({ tenantId: true }).partial();

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

export const validateCreateBrand = zValidator('json', createBrandSchema, validationHook);
export const validateUpdateBrand = zValidator('json', updateBrandSchema, validationHook);

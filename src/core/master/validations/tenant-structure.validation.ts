import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '@/core/tenant/validations/hook';

// ── MARCAS ───────────────────────────────────────────────────────────────────

export const createTenantBrandSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  code: z
    .string()
    .min(1, 'El código es obligatorio')
    .max(20, 'El código no puede exceder los 20 caracteres')
    .regex(/^[a-zA-Z0-9-]+$/, 'El código solo puede contener letras, números y guiones'),
  email: z.string().max(255).optional().nullable(),
  category: z.string().max(255).optional().nullable(),
  primaryColor: z.string().max(255).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateTenantBrandSchema = createTenantBrandSchema.partial();

// ── SUCURSALES ───────────────────────────────────────────────────────────────

const branchAddressSchema = z.object({
  fullAddress: z.string().min(1, 'La dirección es obligatoria').max(500),
  lat: z.number(),
  lng: z.number(),
});

export const createTenantBranchSchema = z.object({
  brandId: z.number().int().positive('La marca es obligatoria'),
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  code: z
    .string()
    .min(1, 'El código es obligatorio')
    .max(20, 'El código no puede exceder los 20 caracteres')
    .regex(/^[a-zA-Z0-9-]+$/, 'El código solo puede contener letras, números y guiones'),
  isMain: z.boolean().optional(),
  isActive: z.boolean().optional(),
  address: branchAddressSchema.optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  whatsapp: z.string().max(30).optional().nullable(),
  email: z.string().max(150).optional().nullable(),
});

export const updateTenantBranchSchema = createTenantBranchSchema.partial();

export type CreateTenantBrandInput = z.infer<typeof createTenantBrandSchema>;
export type UpdateTenantBrandInput = z.infer<typeof updateTenantBrandSchema>;
export type CreateTenantBranchInput = z.infer<typeof createTenantBranchSchema>;
export type UpdateTenantBranchInput = z.infer<typeof updateTenantBranchSchema>;

export const validateCreateTenantBrand = zValidator('json', createTenantBrandSchema, validationHook);
export const validateUpdateTenantBrand = zValidator('json', updateTenantBrandSchema, validationHook);
export const validateCreateTenantBranch = zValidator('json', createTenantBranchSchema, validationHook);
export const validateUpdateTenantBranch = zValidator('json', updateTenantBranchSchema, validationHook);

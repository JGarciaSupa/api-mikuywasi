import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '@/core/tenant/validations/hook';

const valueSchema = z.union([z.number(), z.boolean(), z.string().max(255)]).nullable().optional();

export const createPlanFeatureSchema = z.object({
  // Opcional: si no se envía se genera desde el nombre (ej. "Máximo de sucursales" → "maximoDeSucursales")
  key: z.string().max(60).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'La clave solo admite letras, números y "_" y debe empezar con letra').optional(),
  label: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  description: z.string().max(255).optional().nullable(),
  valueType: z.enum(['number', 'boolean', 'text'], { error: 'Tipo inválido (number, boolean o text)' }),
  unit: z.string().max(40).optional().nullable(),
  defaultValue: valueSchema,
  displayOrder: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

// La clave y el tipo no se editan: los planes ya guardados dependen de ellos
export const updatePlanFeatureSchema = z.object({
  label: z.string().trim().min(1, 'El nombre es obligatorio').max(120).optional(),
  description: z.string().max(255).optional().nullable(),
  unit: z.string().max(40).optional().nullable(),
  defaultValue: valueSchema,
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type CreatePlanFeatureInput = z.infer<typeof createPlanFeatureSchema>;
export type UpdatePlanFeatureInput = z.infer<typeof updatePlanFeatureSchema>;

export const validateCreatePlanFeature = zValidator('json', createPlanFeatureSchema, validationHook);
export const validateUpdatePlanFeature = zValidator('json', updatePlanFeatureSchema, validationHook);

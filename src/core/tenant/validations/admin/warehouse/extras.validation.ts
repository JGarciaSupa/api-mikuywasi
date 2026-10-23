import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../hook';

// ─── Grupos de extras ────────────────────────────────────────────────────────

export const createExtraGroupSchema = z.object({
  brandId: z.coerce.number({ error: 'La marca es requerida' }).int().positive('La marca es requerida'),
  name: z.string({ error: 'El nombre es requerido' }).min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  description: z.string().max(255, 'La descripción no puede exceder los 255 caracteres').optional().nullable(),
  isMultiple: z.boolean().optional(),
  maxSelections: z.coerce.number().int().min(1, 'El máximo de selecciones debe ser al menos 1').optional().nullable(),
  isRequired: z.boolean().optional(),
});

export const updateExtraGroupSchema = createExtraGroupSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Extras individuales ───────────────────────────────────────────────────────
// groupId NO va en el body: se toma del parámetro de ruta y lo añade el controller.

export const createExtraSchema = z.object({
  name: z.string({ error: 'El nombre es requerido' }).min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  price: z.coerce.number({ error: 'El precio es requerido' }).min(0, 'El precio no puede ser negativo'),
  sourceType: z.enum(['item', 'recipe', 'none'], { error: 'Tipo de origen inválido' }),
  itemId: z.coerce.number().int().positive().optional().nullable(),
  itemQty: z.coerce.number().min(0, 'La cantidad no puede ser negativa').optional(),
  recipeId: z.coerce.number().int().positive().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0, 'El orden no puede ser negativo').optional(),
});

export const updateExtraSchema = createExtraSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Asignación de un grupo de extras a un producto ────────────────────────────

export const assignGroupToProductSchema = z.object({
  groupId: z.number({ error: 'El grupo es requerido' }).int().positive('El grupo es requerido'),
  extraIds: z.array(z.number().int().positive()).optional().nullable(),
});

export const bulkAssignGroupByCategorySchema = z.object({
  categoryId: z.number({ error: 'La categoría es requerida' }).int().positive('La categoría es requerida'),
  includeSubcategories: z.boolean().optional(),
  action: z.enum(['link', 'unlink'], { error: 'La acción debe ser link o unlink' }),
  rememberForNewProducts: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

export type CreateExtraGroupInput = z.infer<typeof createExtraGroupSchema>;
export type UpdateExtraGroupInput = z.infer<typeof updateExtraGroupSchema>;
export type CreateExtraInput = z.infer<typeof createExtraSchema>;
export type UpdateExtraInput = z.infer<typeof updateExtraSchema>;
export type BulkAssignGroupByCategoryInput = z.infer<typeof bulkAssignGroupByCategorySchema>;

export const validateCreateExtraGroup = zValidator('json', createExtraGroupSchema, validationHook);
export const validateUpdateExtraGroup = zValidator('json', updateExtraGroupSchema, validationHook);
export const validateCreateExtra = zValidator('json', createExtraSchema, validationHook);
export const validateUpdateExtra = zValidator('json', updateExtraSchema, validationHook);
export const validateAssignGroupToProduct = zValidator('json', assignGroupToProductSchema, validationHook);
export const validateBulkAssignGroupByCategory = zValidator('json', bulkAssignGroupByCategorySchema, validationHook);

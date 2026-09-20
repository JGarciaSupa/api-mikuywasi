import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../hook';

// El code se normaliza a mayúsculas en el service; aquí solo restringimos el
// conjunto de caracteres permitidos. primaryColor debe ser un hex (#RGB o #RRGGBB)
// para evitar inyectar valores arbitrarios donde luego se use como color/estilo.

export const createBrandSchema = z.object({
  name: z.string({ error: 'El nombre es requerido' }).min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder los 100 caracteres'),
  code: z.string({ error: 'El código es requerido' })
    .min(1, 'El código es requerido')
    .max(50, 'El código no puede exceder los 50 caracteres')
    .regex(/^[A-Za-z0-9_-]+$/, 'El código solo puede contener letras, números, guiones y guiones bajos'),
  email: z.string().email('Correo electrónico inválido').max(150).optional().nullable(),
  category: z.string().max(100, 'La categoría no puede exceder los 100 caracteres').optional().nullable(),
  primaryColor: z.string()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Color inválido (formato hex, ej. #1A2B3C)')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

export const updateBrandSchema = createBrandSchema.partial();

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

export const validateCreateBrand = zValidator('json', createBrandSchema, validationHook);
export const validateUpdateBrand = zValidator('json', updateBrandSchema, validationHook);

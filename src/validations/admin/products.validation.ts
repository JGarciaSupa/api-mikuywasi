import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const productSchema = z.object({
  tenantId: z.coerce.number({ error: 'El ID del tenant es requerido' }).int(),
  categoryId: z.coerce.number().int().optional().nullable(),
  name: z.string({ error: 'El nombre es requerido' }).min(1, 'El nombre es requerido').max(150, 'El nombre no puede exceder los 150 caracteres'),
  description: z.string().optional().nullable(),
  price: z.coerce.string({ error: 'El precio es requerido' }).regex(/^\d+(\.\d{1,2})?$/, 'Precio inválido'),
  discountPrice: z.coerce.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio de descuento inválido').optional().nullable(),
  packagingFee: z.coerce.string().regex(/^\d+(\.\d{1,2})?$/, 'Tarifa de empaque inválida').optional().default('0.00'),
  order: z.coerce.number().int().optional().default(0),
  alternatives: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch (e) {
        return [];
      }
    }
    return val;
  }, z.array(z.object({
    name: z.string(),
    extraPrice: z.number()
  }))).optional().default([]),
  isActive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional().default(true),
});

export const updateProductSchema = productSchema.partial();

export const validateCreateProduct = zValidator('form', productSchema);
export const validateUpdateProduct = zValidator('form', updateProductSchema);

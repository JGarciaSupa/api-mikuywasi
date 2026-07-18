import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const productSchema = z.object({
  categoryId: z.coerce.number().int().optional().nullable(),
  name: z.string({ error: 'El nombre es requerido' }).min(1, 'El nombre es requerido').max(150, 'El nombre no puede exceder los 150 caracteres'),
  description: z.string().optional().nullable(),
  price: z.coerce.string({ error: 'El precio es requerido' }).regex(/^\d+(\.\d{1,2})?$/, 'Precio inválido'),
  discountPrice: z.coerce.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio de descuento inválido').optional().nullable(),
  packagingFee: z.coerce.string().regex(/^\d+(\.\d{1,2})?$/, 'Tarifa de empaque inválida').optional().default('0.00'),
  channelPrices: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch (e) {
        return [];
      }
    }
    return val;
  }, z.array(z.object({
    salesChannelId: z.number().int().positive(),
    price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio inválido'),
    discountPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio de descuento inválido').optional().nullable(),
    isActive: z.preprocess((value) => value === 'true' || value === true, z.boolean()).optional().default(true),
    taxes: z.preprocess((val) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch (e) {
          return [];
        }
      }
      return val;
    }, z.array(z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      rate: z.coerce.number().min(0),
      defaultActive: z.preprocess((value) => value === 'true' || value === true, z.boolean()).optional().default(false),
      isActive: z.preprocess((value) => value === 'true' || value === true, z.boolean()).optional().default(false),
    }))).optional(),
  }))).optional(),
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
  allowSellWithoutStock: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional().default(false),
  // Stock manual del producto (cantidad disponible digitada al crear/editar). Vacío o ausente = sin límite.
  stock: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : val),
    z.coerce.number().int('El stock debe ser un número entero').min(0, 'El stock no puede ser negativo').nullable()
  ).optional(),
});

export const updateProductSchema = productSchema.partial();

export type CreateProductInput = z.infer<typeof productSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const validateCreateProduct = zValidator('form', productSchema);
export const validateUpdateProduct = zValidator('form', updateProductSchema);

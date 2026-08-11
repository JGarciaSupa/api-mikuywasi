import { z } from 'zod';

export const createReceiptTypeSchema = z.object({
  // Opcional: si se omite o es null → tipo de comprobante global/interno (todos los países).
  countryId: z.number().int().positive().optional().nullable(),
  code: z.string().min(1, 'El código es obligatorio').max(50, 'El código es muy largo'),
  name: z.string().min(1, 'El nombre es obligatorio').max(100, 'El nombre es muy largo'),
  documentPrefix: z.string().max(1, 'El prefijo debe tener máximo 1 carácter').optional().nullable(),
  description: z.string().max(255).optional().nullable(),
  isGlobal: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

export const updateReceiptTypeSchema = createReceiptTypeSchema.partial();

export type CreateReceiptTypeInput = z.infer<typeof createReceiptTypeSchema>;
export type UpdateReceiptTypeInput = z.infer<typeof updateReceiptTypeSchema>;

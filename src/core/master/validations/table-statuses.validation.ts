import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createTableStatusSchema = z.object({
  code: z.string().min(1, 'El código es requerido').max(50),
  name: z.string().min(1, 'El nombre es requerido').max(100),
  description: z.string().optional().nullable(),
  colorHex: z.string().min(1, 'El color hexadecimal es requerido').max(20),
  bgColorClass: z.string().min(1, 'La clase de color de fondo es requerida').max(50),
  displayOrder: z.number().int().default(0),
  isOperational: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const updateTableStatusSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100).optional(),
  description: z.string().optional().nullable(),
  colorHex: z.string().min(1, 'El color hexadecimal es requerido').max(20).optional(),
  bgColorClass: z.string().min(1, 'La clase de color de fondo es requerida').max(50).optional(),
  displayOrder: z.number().int().optional(),
  isOperational: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type CreateTableStatusInput = z.infer<typeof createTableStatusSchema>;
export type UpdateTableStatusInput = z.infer<typeof updateTableStatusSchema>;

export const validateCreateTableStatus = zValidator('json', createTableStatusSchema);
export const validateUpdateTableStatus = zValidator('json', updateTableStatusSchema);

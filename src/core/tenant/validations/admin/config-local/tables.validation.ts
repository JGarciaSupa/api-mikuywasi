import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createTableSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(50, 'El nombre no puede exceder los 50 caracteres'),
  branchId: z.number().optional(),
  capacity: z.number().int().min(1, 'La capacidad mínima es 1').optional().default(1),
});

export const updateTableSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(50, 'El nombre no puede exceder los 50 caracteres'),
  capacity: z.number().int().min(1, 'La capacidad mínima es 1').optional(),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

export const validateCreateTable = zValidator('json', createTableSchema);
export const validateUpdateTable = zValidator('json', updateTableSchema);

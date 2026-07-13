import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createTableSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(50, 'El nombre no puede exceder los 50 caracteres'),
  branchId: z.number({ error: 'La sucursal es requerida' }).int().positive('La sucursal es requerida'),
  capacity: z.number().int().min(1, 'La capacidad mínima es 1').optional().default(1),
  // null/omitido = mesa sin salón
  salonId: z.uuid('El salón es inválido').nullable().optional(),
});

export const updateTableSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(50, 'El nombre no puede exceder los 50 caracteres'),
  capacity: z.number().int().min(1, 'La capacidad mínima es 1').optional(),
  // null = quitar la mesa del salón; omitido = no tocar la asignación
  salonId: z.uuid('El salón es inválido').nullable().optional(),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

export const validateCreateTable = zValidator('json', createTableSchema);
export const validateUpdateTable = zValidator('json', updateTableSchema);

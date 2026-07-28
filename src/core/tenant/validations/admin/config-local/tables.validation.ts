import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const shapeSchema = z.enum(['square', 'round']);

export const createTableSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(50, 'El nombre no puede exceder los 50 caracteres'),
  branchId: z.number({ error: 'La sucursal es requerida' }).int().positive('La sucursal es requerida'),
  capacity: z.number().int().min(1, 'La capacidad mínima es 1').optional().default(1),
  shape: shapeSchema.optional().default('square'),
  // salón obligatorio y válido
  salonId: z.string({ error: 'Debes seleccionar un salón obligatorio' }).uuid('El salón es inválido'),
});

export const updateTableSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(50, 'El nombre no puede exceder los 50 caracteres'),
  capacity: z.number().int().min(1, 'La capacidad mínima es 1').optional(),
  shape: shapeSchema.optional(),
  // no-nulable = no se puede quitar el salón de una mesa una vez asignado
  salonId: z.string().uuid('El salón es inválido').optional(),
});

// Actualización liviana de posición: se llama en cada "soltar" del arrastre en el
// mapa de mesas, sin revalidar/reenviar nombre, capacidad o salón.
export const positionTableSchema = z.object({
  posX: z.number().min(0, 'La posición X debe estar entre 0 y 100').max(100, 'La posición X debe estar entre 0 y 100'),
  posY: z.number().min(0, 'La posición Y debe estar entre 0 y 100').max(100, 'La posición Y debe estar entre 0 y 100'),
});

export const statusTableSchema = z.object({
  statusCode: z.string().min(1, 'El código de estado es requerido'),
  reservationNote: z.string().optional().nullable(),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type PositionTableInput = z.infer<typeof positionTableSchema>;
export type StatusTableInput = z.infer<typeof statusTableSchema>;

export const validateCreateTable = zValidator('json', createTableSchema);
export const validateUpdateTable = zValidator('json', updateTableSchema);
export const validatePositionTable = zValidator('json', positionTableSchema);
export const validateStatusTable = zValidator('json', statusTableSchema);


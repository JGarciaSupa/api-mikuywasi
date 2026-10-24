import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../hook';

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

// Creación en bloque: numeración (prefijo + desde + cantidad) o réplica de una mesa (sourceTableId)
export const MAX_BULK_TABLES = 200;
export const bulkCreateTablesSchema = z.object({
  branchId: z.number({ error: 'La sucursal es requerida' }).int().positive('La sucursal es requerida'),
  salonId: z.string().uuid('El salón es inválido').optional(),
  sourceTableId: z.number().int().positive().optional(),
  prefix: z.string().max(40, 'El prefijo no puede exceder los 40 caracteres').optional(),
  start: z.number().int().min(0, 'El número inicial no puede ser negativo').max(99999).optional(),
  count: z.number({ error: 'La cantidad es requerida' }).int('La cantidad debe ser un número entero')
    .min(1, 'Crea al menos 1 mesa').max(MAX_BULK_TABLES, `Puedes crear hasta ${MAX_BULK_TABLES} mesas a la vez`),
  capacity: z.number().int().min(1, 'La capacidad mínima es 1').max(99, 'La capacidad máxima es 99').optional().default(1),
  shape: shapeSchema.optional().default('square'),
  dryRun: z.boolean().optional(),
}).refine((d) => d.sourceTableId || d.salonId, { message: 'Debes seleccionar un salón', path: ['salonId'] });

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type BulkCreateTablesInput = z.infer<typeof bulkCreateTablesSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type PositionTableInput = z.infer<typeof positionTableSchema>;
export type StatusTableInput = z.infer<typeof statusTableSchema>;

export const validateCreateTable = zValidator('json', createTableSchema);
export const validateUpdateTable = zValidator('json', updateTableSchema);
export const validatePositionTable = zValidator('json', positionTableSchema);
export const validateStatusTable = zValidator('json', statusTableSchema);
export const validateBulkCreateTables = zValidator('json', bulkCreateTablesSchema, validationHook);


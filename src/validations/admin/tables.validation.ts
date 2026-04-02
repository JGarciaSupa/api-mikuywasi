import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createTableSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(50, 'El nombre no puede exceder los 50 caracteres'),
  tenantId: z.number({ error: 'El ID del tenant es requerido' }),
});

export const updateTableSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(50, 'El nombre no puede exceder los 50 caracteres'),
});

export const validateCreateTable = zValidator('json', createTableSchema);
export const validateUpdateTable = zValidator('json', updateTableSchema);

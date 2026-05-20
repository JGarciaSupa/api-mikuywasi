import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../../validations/hook';

export const createDbServerSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  dbHost: z.string().min(1, 'El host es obligatorio').max(255),
  dbPort: z.coerce.number().int().min(1).max(65535).default(5432),
  dbUser: z.string().min(1, 'El usuario de DB es obligatorio').max(255),
  dbPassword: z.string().min(1, 'La contraseña de DB es obligatoria'),
  isActive: z.boolean().default(true),
  maxTenants: z.coerce.number().int().min(1).default(100),
});

export const updateDbServerSchema = createDbServerSchema.partial().omit({ name: true });

export const updateDbServerFullSchema = createDbServerSchema.partial();

export type CreateDbServerInput = z.infer<typeof createDbServerSchema>;
export type UpdateDbServerInput = z.infer<typeof updateDbServerFullSchema>;

export const validateCreateDbServer = zValidator('json', createDbServerSchema, validationHook);
export const validateUpdateDbServer = zValidator('json', updateDbServerFullSchema, validationHook);

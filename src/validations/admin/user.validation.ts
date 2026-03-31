import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../hook';

export const createTenantUserSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(255),
});

export type CreateTenantUserInput = z.infer<typeof createTenantUserSchema>;

export const validateCreateTenantUser = zValidator('json', createTenantUserSchema, validationHook);

import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../hook';

export const createStaffSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(255),
  role: z.enum(['admin']),
});

export const updateStaffSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255).optional(),
  email: z.string().email('Email inválido').optional(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(255).optional(),
  role: z.enum(['admin']).optional(),
});

export const staffQuerySchema = z.object({
  name: z.string().optional(),
  page: z.string().optional().default('1').transform((val) => parseInt(val, 10)),
  limit: z.string().optional().default('10').transform((val) => parseInt(val, 10)),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type StaffQueryInput = z.infer<typeof staffQuerySchema>;

export const validateStaffQuery = zValidator('query', staffQuerySchema, validationHook);
export const validateCreateStaff = zValidator('form', createStaffSchema, validationHook);
export const validateUpdateStaff = zValidator('form', updateStaffSchema, validationHook);


import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../../validations/hook';

export const createUserSchema = z.object({
  userName: z.string()
    .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
    .max(255)
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guion bajo'),

  email: z.string()
    .trim()
    .email('Email inválido')
    .optional()
    .nullable()
    .or(z.literal('')) // Permite strings vacíos de formularios
    .transform((val) => (val === '' || !val ? null : val.toLowerCase())), // Si está vacío o no existe, lo transforma a null

  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(255),

  name: z.string()
    .min(1, 'El nombre es obligatorio')
    .max(255),

  image: z.string()
    .url('URL de imagen inválida')
    .optional()
    .nullable()
    .or(z.literal('')) // Permite strings vacíos
    .transform((val) => (val === '' ? null : val)), // Convierte string vacío a null
});

export const updateUserSchema = z.object({
  userName: z.string().min(3).max(255).regex(/^[a-zA-Z0-9_]+$/).optional(),
  email: z.string().trim().email('Email inválido').optional().nullable().transform((val) => val?.toLowerCase()),
  name: z.string().min(1).max(255).optional(),
  image: z.string().url().optional().nullable(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es obligatoria'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres').max(255),
});

export const loginSchema = z.object({
  userName: z.string().min(1, 'El usuario es obligatorio'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const validateCreateUser = zValidator('json', createUserSchema, validationHook);
export const validateUpdateUser = zValidator('json', updateUserSchema, validationHook);
export const validateUpdatePassword = zValidator('json', updatePasswordSchema, validationHook);
export const validateLogin = zValidator('json', loginSchema, validationHook);

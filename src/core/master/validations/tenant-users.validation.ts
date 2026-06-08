import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '@/core/tenant/validations/hook';

const staffRoles = ['admin', 'kitchen', 'waiter', 'delivery'] as const;
const rbacBaseRoles = ['rol_admin', 'rol_cajero', 'rol_cocinero', 'rol_mozo', 'rol_almacenero'] as const;

export const createTenantUserSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  username: z
    .string()
    .min(3, 'El username debe tener al menos 3 caracteres')
    .max(50, 'El username no puede exceder los 50 caracteres')
    .regex(/^[a-zA-Z0-9_.]+$/, 'El username solo puede contener letras, números, puntos y guiones bajos'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(255),
  role: z.enum(staffRoles, { error: 'Rol inválido' }),
  rbacBaseRoleCode: z.enum(rbacBaseRoles).optional().nullable(),
  image: z.string().url('URL de imagen inválida').optional().nullable(),
});

export const updateTenantUserSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255).optional(),
  username: z
    .string()
    .min(3, 'El username debe tener al menos 3 caracteres')
    .max(50)
    .regex(/^[a-zA-Z0-9_.]+$/, 'El username solo puede contener letras, números, puntos y guiones bajos')
    .optional(),
  role: z.enum(staffRoles).optional(),
  rbacBaseRoleCode: z.enum(rbacBaseRoles).optional().nullable(),
  image: z.string().url('URL de imagen inválida').optional().nullable(),
});

export const updateTenantUserPasswordSchema = z.object({
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(255),
});

export type CreateTenantUserInput = z.infer<typeof createTenantUserSchema>;
export type UpdateTenantUserInput = z.infer<typeof updateTenantUserSchema>;
export type UpdateTenantUserPasswordInput = z.infer<typeof updateTenantUserPasswordSchema>;

export const validateCreateTenantUser = zValidator('json', createTenantUserSchema, validationHook);
export const validateUpdateTenantUser = zValidator('json', updateTenantUserSchema, validationHook);
export const validateUpdateTenantUserPassword = zValidator('json', updateTenantUserPasswordSchema, validationHook);

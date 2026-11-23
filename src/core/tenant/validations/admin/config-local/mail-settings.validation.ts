import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../hook';

export const saveMailSettingsSchema = z.object({
  host: z.string().trim().min(3, 'El servidor es requerido').max(255),
  port: z.coerce.number().int().refine((p) => [25, 465, 587, 2525].includes(p), 'Puerto no válido (465 o 587)'),
  username: z.string().trim().email('El usuario debe ser un correo válido').max(255),
  // Vacío = mantener la guardada
  password: z.string().max(255).optional(),
  fromName: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const testMailSchema = z.object({
  to: z.string().trim().email('Correo de destino no válido'),
});

export const validateSaveMailSettings = zValidator('json', saveMailSettingsSchema, validationHook);
export const validateTestMail = zValidator('json', testMailSchema, validationHook);

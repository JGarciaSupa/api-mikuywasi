import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '@/core/tenant/validations/hook';

// Actualizar QAS: se escribe el slug para confirmar (evita disparos accidentales)
export const refreshFromPrdSchema = z.object({
  confirmSlug: z.string().min(1, 'Escribe el slug para confirmar'),
});

// Clonar a QAS: tenant nuevo en esta plataforma con los datos de PRD.
// slug, nombre y BD son opcionales: por defecto los mismos que en PRD.
export const cloneFromPrdSchema = z.object({
  confirmSlug: z.string().min(1, 'Escribe el slug para confirmar'),
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones').optional(),
  dbName: z.string().min(1).max(255).regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guion bajo').optional(),
  serverId: z.coerce.number().int().positive('El servidor es obligatorio'),
  planId: z.coerce.number().int().positive('El plan es obligatorio'),
  billingCycle: z.enum(['monthly', 'yearly']),
  planEndsAt: z.string().datetime().optional().nullable(),
});

export type RefreshFromPrdInput = z.infer<typeof refreshFromPrdSchema>;
export type CloneFromPrdInput = z.infer<typeof cloneFromPrdSchema>;

export const validateRefreshFromPrd = zValidator('json', refreshFromPrdSchema, validationHook);
export const validateCloneFromPrd = zValidator('json', cloneFromPrdSchema, validationHook);

import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createSocialNetworkSchema = z.object({
  tenantId: z.number({ error: 'El ID del tenant es requerido' }).int(),
  platform: z.enum(['whatsapp', 'instagram', 'facebook', 'tiktok', 'x', 'youtube'], {
    message: 'Plataforma no válida'
  }),
  url: z.string({ error: 'La URL es requerida' }).url('Formato de URL inválido'),
  order: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateSocialNetworkSchema = createSocialNetworkSchema.partial();

export const reorderSocialNetworksSchema = z.object({
  socialNetworks: z.array(z.object({
    id: z.number({ error: 'El ID es requerido' }).int(),
    order: z.number({ error: 'El orden es requerido' }).int()
  }))
});

export const validateCreateSocialNetwork = zValidator('json', createSocialNetworkSchema);
export const validateUpdateSocialNetwork = zValidator('json', updateSocialNetworkSchema);
export const validateReorderSocialNetworks = zValidator('json', reorderSocialNetworksSchema);

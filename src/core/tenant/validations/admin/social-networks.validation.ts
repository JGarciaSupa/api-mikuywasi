import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createSocialNetworkSchema = z.object({
  platform: z.enum(['whatsapp', 'instagram', 'facebook', 'tiktok', 'x', 'youtube'], {
    message: 'Plataforma no válida'
  }),
  url: z.string({ error: 'La URL es requerida' }).url({ message: 'Formato de URL inválido' }),
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

export type CreateSocialNetworkInput = z.infer<typeof createSocialNetworkSchema>;
export type UpdateSocialNetworkInput = z.infer<typeof updateSocialNetworkSchema>;
export type ReorderSocialNetworksInput = z.infer<typeof reorderSocialNetworksSchema>;

export const validateCreateSocialNetwork = zValidator('json', createSocialNetworkSchema);
export const validateUpdateSocialNetwork = zValidator('json', updateSocialNetworkSchema);
export const validateReorderSocialNetworks = zValidator('json', reorderSocialNetworksSchema);

import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createBannerSchema = z.object({
  tenantId: z.string({ error: 'El ID del tenant es requerido' }).transform(val => parseInt(val)),
  order: z.string().optional().default('0').transform(val => parseInt(val)),
});

export const updateBannerSchema = z.object({
  order: z.string().optional().transform(val => (val ? parseInt(val) : undefined)),
});

export const reorderBannersSchema = z.object({
  banners: z.array(z.object({
    id: z.number({ error: 'El ID es requerido' }).int(),
    order: z.number({ error: 'El orden es requerido' }).int()
  }))
});

export const validateCreateBanner = zValidator('form', createBannerSchema);
export const validateUpdateBanner = zValidator('form', updateBannerSchema);
export const validateReorderBanners = zValidator('json', reorderBannersSchema);

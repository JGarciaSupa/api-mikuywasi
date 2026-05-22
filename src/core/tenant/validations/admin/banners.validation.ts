import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createBannerSchema = z.object({
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

export type CreateBannerInput = z.infer<typeof createBannerSchema>;
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
export type ReorderBannersInput = z.infer<typeof reorderBannersSchema>;

export const validateCreateBanner = zValidator('form', createBannerSchema);
export const validateUpdateBanner = zValidator('form', updateBannerSchema);
export const validateReorderBanners = zValidator('json', reorderBannersSchema);

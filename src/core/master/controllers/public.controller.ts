import { Context } from "hono";
import * as publicService from '../services/public.service';

export const getTenantBySlug = async (c: Context) => {
  try {
    const slug = c.req.param('slug') || '';
    const result = await publicService.getTenantBySlug(slug);
    return c.json({ success: true, message: 'Tenant obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Tenant no encontrado', data: null }, 404);
  }
};
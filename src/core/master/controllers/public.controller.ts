import { Context } from "hono";
import redisApi from "@/redis/index";

export const getTenantBySlug = async (c: Context) => {
  try {
    const slug = c.req.param('slug') || '';
    const result = await redisApi.getTenantBySlug(slug);
    const { dbUrl, ...data } = result;
    return c.json({
      success: true, message: 'Tenant obtenido con éxito', data
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Tenant no encontrado', data: null }, 404);
  }
};
import type { Context } from 'hono';
import { getDashboardStats } from '../../services/admin/dashboard.service';

export const getDashboardStatsController = async (c: Context) => {
  try {
    const stats = await getDashboardStats();
    return c.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener las estadísticas del dashboard'
    }, 500);
  }
};

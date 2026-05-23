import type { Context } from 'hono';
import { getTenantDashboardStats } from '../../services/admin/tenant-dashboard.service';

export const getTenantDashboardStatsController = async (c: Context) => {
  try {
    const stats = await getTenantDashboardStats();
    
    return c.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener las estadísticas del tenant'
    }, 500);
  }
};

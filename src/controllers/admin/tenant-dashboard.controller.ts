import type { Context } from 'hono';
import { getTenantDashboardStats } from '../../services/admin/tenant-dashboard.service';

export const getTenantDashboardStatsController = async (c: Context) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;

    if (!tenantId) {
      return c.json({
        success: false,
        message: 'No se encontró el ID del tenant en la sesión'
      }, 400);
    }

    const stats = await getTenantDashboardStats(tenantId);
    
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

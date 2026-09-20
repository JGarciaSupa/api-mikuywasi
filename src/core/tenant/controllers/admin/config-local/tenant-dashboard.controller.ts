import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import { getTenantDashboardStats } from '../../../services/admin/config-local/tenant-dashboard.service';

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
      message: safeMessage(error, 'Error al obtener las estadísticas del tenant')
    }, 500);
  }
};

import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import { getClientIp } from '@/utils/ip';
import * as deployService from '../services/deploy-admin.service';

export const getDeployOverviewController = async (c: Context) => {
  try {
    const data = await deployService.getDeployOverview();
    return c.json({ success: true, message: 'Estado del despliegue obtenido', data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener el estado del despliegue'), data: null }, 500);
  }
};

export const retryDeployController = async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const mode = body?.mode === 'all' ? 'all' : 'failed';
    const payload = c.get('masterPayload');
    const data = await deployService.startDeployRetry(mode, {
      userId: payload?.userId ?? payload?.id ?? null,
      userName: payload?.userName ?? null,
      ipAddress: getClientIp(c),
      userAgent: c.req.header('user-agent') ?? null,
    });
    return c.json({ success: true, message: 'Ejecución iniciada', data }, 202);
  } catch (error: any) {
    const status = error.message?.includes('en curso') ? 409 : 400;
    return c.json({ success: false, message: safeMessage(error, 'Error al iniciar la ejecución'), data: null }, status);
  }
};

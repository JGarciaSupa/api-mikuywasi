import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import { getClientIp } from '@/utils/ip';
import * as prdSyncService from '../services/prd-sync.service';

const syncContext = (c: Context): prdSyncService.PrdSyncContext => {
  const payload = c.get('masterPayload');
  return {
    userId: payload?.userId ?? payload?.id ?? null,
    ipAddress: getClientIp(c),
    userAgent: c.req.header('user-agent') ?? null,
  };
};

export const getPrdSyncStatusController = async (c: Context) => {
  try {
    const result = prdSyncService.getPrdSyncStatus();
    return c.json({ success: true, message: 'Estado obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener el estado de la sincronización'), data: null }, 500);
  }
};

export const getPrdSyncJobController = async (c: Context) => {
  try {
    const result = prdSyncService.getPrdSyncJob(c.req.param('jobId') || '');
    return c.json({ success: true, message: 'Sincronización obtenida con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener la sincronización'), data: null }, 404);
  }
};

export const getPrdTenantsController = async (c: Context) => {
  try {
    const result = await prdSyncService.listPrdTenants();
    return c.json({ success: true, message: 'Tenants de PRD obtenidos con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al leer los tenants de PRD'), data: null }, 400);
  }
};

export const refreshFromPrdController = async (c: Context) => {
  try {
    const slug = c.req.param('slug') || '';
    const data = c.req.valid('json' as never);
    const result = await prdSyncService.startRefreshFromPrd(slug, data, syncContext(c));
    return c.json({ success: true, message: 'Actualización desde PRD iniciada', data: result }, 202);
  } catch (error: any) {
    const status = error.message?.includes('en curso') ? 409 : 400;
    return c.json({ success: false, message: safeMessage(error, 'Error al iniciar la actualización desde PRD'), data: null }, status);
  }
};

export const cloneFromPrdController = async (c: Context) => {
  try {
    const slug = c.req.param('slug') || '';
    const data = c.req.valid('json' as never);
    const result = await prdSyncService.startCloneFromPrd(slug, data, syncContext(c));
    return c.json({ success: true, message: 'Clonación desde PRD iniciada', data: result }, 202);
  } catch (error: any) {
    const status = error.message?.includes('en curso') ? 409 : 400;
    return c.json({ success: false, message: safeMessage(error, 'Error al iniciar la clonación desde PRD'), data: null }, status);
  }
};

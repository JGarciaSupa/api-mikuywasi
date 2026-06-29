import type { Context } from 'hono';
import * as auditService from '../../../services/admin/documents/audit-log.service';
import { jsonError } from '@/utils/helpers';

export const listAuditLogs = async (c: Context) => {
  try {
    const q = c.req.query();
    const data = await auditService.listAuditLogs({
      page: q.page ? parseInt(q.page) : undefined,
      limit: q.limit ? parseInt(q.limit) : undefined,
      userId: q.userId ? parseInt(q.userId) : undefined,
      module: q.module || undefined,
      tableName: q.tableName || undefined,
      operation: q.operation || undefined,
      search: q.search || undefined,
      from: q.from || undefined,
      to: q.to || undefined,
    });
    return c.json({ success: true, ...data });
  } catch (e) {
    return jsonError(c, e, 'Error al listar la auditoría');
  }
};

export const getAuditFacets = async (c: Context) => {
  try {
    const data = await auditService.getAuditFacets();
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener filtros de auditoría');
  }
};

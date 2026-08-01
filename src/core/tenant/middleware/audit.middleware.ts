import type { Context, Next } from 'hono';
import { writeAuditLog } from '../services/admin/warehouse/shared/audit.service';

declare module 'hono' {
  interface ContextVariableMap {
    auditLogged?: boolean;
  }
}

function inferModuleFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes('/categories') || lower.includes('/products')) return 'productos';
  if (lower.includes('/staff') || lower.includes('/rbac') || lower.includes('/auth')) return 'usuarios';
  if (lower.includes('/caja') || lower.includes('/cash')) return 'caja';
  if (lower.includes('/warehouse')) return 'inventario';
  if (lower.includes('/billing') || lower.includes('/sunat') || lower.includes('/tax-profiles')) return 'facturacion';
  if (lower.includes('/customers')) return 'clientes';
  if (lower.includes('/orders')) return 'pedidos';
  return 'admin';
}

function inferTableNameFromPath(path: string): string {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  // Ej: /api/admin/staff/5 -> parts: ['api', 'admin', 'staff', '5']
  if (parts.length >= 3) {
    return parts[2];
  }
  return parts[parts.length - 1] ?? 'admin';
}

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(sanitizeBody);

  const copy: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (['password', 'token', 'refreshToken', 'secret'].includes(key)) {
      copy[key] = '[PROTECTION]';
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

export async function auditMiddleware(c: Context, next: Next) {
  const method = c.req.method.toUpperCase();

  // Solo auditar métodos de mutación de estado
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    await next();
    return;
  }

  // Intentar obtener el cuerpo antes de next() si es JSON
  let requestBody: unknown = null;
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const cloned = c.req.raw.clone();
      requestBody = sanitizeBody(await cloned.json());
    } catch {
      // Si falla el parseo de JSON, se ignora silenciosamente
    }
  }

  await next();

  // Solo auditar si la respuesta fue exitosa (2xx) y no fue auditada ya por un servicio interno
  if (c.res.status >= 200 && c.res.status < 300 && !c.get('auditLogged')) {
    try {
      const payload = c.get('jwtPayload');
      const path = c.req.path;
      const moduleName = inferModuleFromPath(path);
      const tableName = inferTableNameFromPath(path);
      const operation = method === 'POST' ? 'INSERT' : method === 'DELETE' ? 'DELETE' : 'UPDATE';

      const ipAddress = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? null;

      // Intentar extraer recordId si el parámetro ':id' está en la URL
      let recordId: number | null = null;
      try {
        const rawId = c.req.param('id');
        if (rawId) recordId = parseInt(rawId, 10) || null;
      } catch {
        recordId = null;
      }

      const description = `${method} ${path}`;

      await writeAuditLog({
        tableName,
        operation,
        recordId,
        beforeData: null,
        afterData: requestBody,
        userId: payload?.userId ?? null,
        userName: (payload as any)?.userName ?? (payload as any)?.name ?? (payload as any)?.email ?? null,
        module: moduleName,
        description,
        ipAddress,
      });

      c.set('auditLogged', true);
    } catch (err) {
      console.error('Error al registrar auditoría automática en middleware:', err);
    }
  }
}
